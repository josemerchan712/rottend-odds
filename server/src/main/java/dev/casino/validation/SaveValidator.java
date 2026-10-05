package dev.casino.validation;

import com.fasterxml.jackson.databind.JsonNode;
import dev.casino.common.ApiException;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import dev.casino.validation.GameRules.Upgrade;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Valida un guardado del juego en dos capas, sin re-simular la partida:
 * <ol>
 *   <li><b>Imposible</b> (422): estructura, versión, niveles fuera de rango, mejoras compradas sin
 *       su requisito, deuda pagada sin haber reunido el dinero...</li>
 *   <li><b>Implausible</b> (se acepta, pero "no verificado"): más fichas ganadas de las que la
 *       tabla estadística considera posibles para ese tiempo de juego, o la deuda saldada antes del
 *       mínimo plausible.</li>
 * </ol>
 * Las mesas 2 (tragaperras), 3 (dados), 4 (blackjack) y 5 (doble o nada) solo pasan la capa 1: estructura, niveles de sus mejoras y
 * que no haya progreso en una sin la deuda de la anterior pagada. El ranking sigue siendo el de la mesa 1.
 */
@Component
public class SaveValidator {

    /** Mejoras que el juego solo deja comprar con el Crupier. */
    private static final Set<String> NEED_CRUPIER = Set.of("helperSpeed", "helperProfile", "helperLuck");
    /** Mesas 2 y 3: mejoras que requieren a su ayudante. */
    private static final Set<String> NEED_HELPER = Set.of("helperSpeed", "helperProfile", "helperLuck");
    private static final double MAX_SANE_NUMBER = 1e15;
    private static final double MAX_PLAY_TIME = 1e8;

    private final GameRules rules;

    public SaveValidator(GameRules rules) {
        this.rules = rules;
    }

    /** Lo que el servidor necesita de un guardado. */
    public record Snapshot(int saveVersion, double balance, double playTime, Map<String, Integer> upgrades, boolean debtPaid) {}

    public record Result(Snapshot snapshot, boolean verified, String note, double minimumEarned) {}

    /** Valida o lanza 422 con todos los motivos de la capa 1. */
    public Result validate(JsonNode data) {
        List<String> errors = new ArrayList<>();
        Snapshot snap = parse(data, errors);
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Guardado imposible", errors);
        }
        double earned = snap.balance() + rules.spentOn(snap.upgrades()) + (snap.debtPaid() ? rules.debtAmount() : 0);

        // Capa 2: estadística. No rechaza; marca.
        double limit = Math.max(rules.plausibility().maxEarnedAt(snap.playTime()), rules.workCeiling(snap.playTime()));
        if (earned > limit) {
            return new Result(snap, false, "Fichas ganadas (" + fmt(earned) + ") por encima del máximo plausible ("
                    + fmt(limit) + ") para " + fmt(snap.playTime()) + " s de juego", earned);
        }
        if (snap.debtPaid() && snap.playTime() < rules.plausibility().minDebtSeconds()) {
            return new Result(snap, false, "Deuda saldada en " + fmt(snap.playTime()) + " s, por debajo del mínimo plausible ("
                    + fmt(rules.plausibility().minDebtSeconds()) + " s)", earned);
        }
        return new Result(snap, true, null, earned);
    }

    private Snapshot parse(JsonNode data, List<String> errors) {
        if (data == null || !data.isObject()) {
            errors.add("data: debe ser un objeto con la partida");
            return null;
        }
        JsonNode versionNode = data.path("version");
        int version = versionNode.isInt() ? versionNode.asInt() : -1;
        if (version != rules.saveVersion()) {
            errors.add("version: se esperaba la versión de guardado " + rules.saveVersion());
        }
        JsonNode state = data.path("state");
        if (!state.isObject()) {
            errors.add("state: falta el estado de la partida");
            return null;
        }
        double balance = number(state, "balance", errors);
        double playTime = number(state, "playTime", errors);
        if (playTime > MAX_PLAY_TIME) errors.add("playTime: fuera de rango");

        Map<String, Integer> levels = new LinkedHashMap<>();
        JsonNode ups = state.path("upgrades");
        if (!ups.isObject()) {
            errors.add("upgrades: falta el objeto de mejoras");
        } else {
            ups.fieldNames().forEachRemaining(id -> {
                if (!rules.upgrades().containsKey(id)) errors.add("upgrades." + id + ": mejora desconocida");
            });
            for (var e : rules.upgrades().entrySet()) {
                JsonNode level = ups.path(e.getKey());
                if (level.isMissingNode()) {
                    levels.put(e.getKey(), 0);
                } else if (!level.canConvertToInt() || !level.isIntegralNumber()) {
                    errors.add("upgrades." + e.getKey() + ": debe ser un entero");
                } else if (level.asInt() < 0 || level.asInt() > e.getValue().maxLevel()) {
                    errors.add("upgrades." + e.getKey() + ": nivel " + level.asInt() + " fuera de 0-" + e.getValue().maxLevel());
                } else {
                    levels.put(e.getKey(), level.asInt());
                }
            }
            if (levels.getOrDefault("crupier", 0) == 0) {
                for (String id : NEED_CRUPIER) {
                    if (levels.getOrDefault(id, 0) > 0) errors.add("upgrades." + id + ": requiere el Crupier");
                }
            }
        }

        JsonNode profile = state.path("helper").path("profile");
        if (!profile.isMissingNode()) {
            int unlocked = Math.min(levels.getOrDefault("helperProfile", 0), rules.helperProfiles() - 1);
            if (!profile.isInt() || profile.asInt() < 0 || profile.asInt() > unlocked) {
                errors.add("helper.profile: perfil no desbloqueado");
            }
        }

        JsonNode debtNode = state.path("debtPaid");
        boolean debtPaid = false;
        if (!debtNode.isMissingNode()) {
            if (!debtNode.isBoolean()) errors.add("debtPaid: debe ser true o false");
            debtPaid = debtNode.asBoolean();
        }

        boolean slotsPaid = parseTable(state.path("slots"), new TableSpec("slots", "mesa 2", rules.slotsUpgrades(), "zombie",
                "el empleado zombi", rules.slotsHelperProfiles(), "mesa 1"), debtPaid, errors);
        boolean dicePaid = parseTable(state.path("dice"), new TableSpec("dice", "mesa 3", rules.diceUpgrades(), "ghost",
                "el camarero fantasma", rules.diceHelperProfiles(), "mesa 2"), debtPaid && slotsPaid, errors);
        boolean cardsPaid = parseTable(state.path("cards"), new TableSpec("cards", "mesa 4", rules.cardsUpgrades(), "skeleton",
                "el esqueleto barajador", rules.cardsHelperProfiles(), "mesa 3"), debtPaid && slotsPaid && dicePaid, errors);
        boolean coinOpen = debtPaid && slotsPaid && dicePaid && cardsPaid;
        boolean coinPaid = parseTable(state.path("coin"), new TableSpec("coin", "mesa 5", rules.coinUpgrades(), "imp",
                "el diablillo coronado", rules.coinHelperProfiles(), "mesa 4"), coinOpen, errors);
        parseCoinExtras(state.path("coin"), coinOpen, errors);
        parseCoinChains(state.path("coin"), errors);
        parseEnding(state, new boolean[] {debtPaid, slotsPaid, dicePaid, cardsPaid, coinPaid}, playTime, errors);
        JsonNode active = state.path("activeTable");
        if (!active.isMissingNode() && (!active.isInt() || active.asInt() < 1 || active.asInt() > 5)) {
            errors.add("activeTable: debe ser 1, 2, 3, 4 o 5");
        } else if (active.asInt(1) == 2 && !debtPaid) {
            errors.add("activeTable: la mesa 2 requiere la deuda de la mesa 1 pagada");
        } else if (active.asInt(1) == 3 && !(debtPaid && slotsPaid)) {
            errors.add("activeTable: la mesa 3 requiere la deuda de la mesa 2 pagada");
        } else if (active.asInt(1) == 4 && !(debtPaid && slotsPaid && dicePaid)) {
            errors.add("activeTable: la mesa 4 requiere la deuda de la mesa 3 pagada");
        } else if (active.asInt(1) == 5 && !(debtPaid && slotsPaid && dicePaid && cardsPaid)) {
            errors.add("activeTable: la mesa 5 requiere la deuda de la mesa 4 pagada");
        }
        return new Snapshot(version, balance, playTime, levels, debtPaid);
    }

    /** Estructura de una mesa añadida (2, 3...): saldo, tiempo, mejoras, ayudante, deuda y progreso. */
    private record TableSpec(String field, String label, Map<String, Upgrade> upgrades, String helperId, String helperName,
            int helperProfiles, String previous) {}

    /**
     * Mesa 2 o 3: estructura y niveles. Sin la deuda de la mesa anterior pagada, debe estar sin
     * empezar. Devuelve si su deuda está pagada.
     */
    private boolean parseTable(JsonNode table, TableSpec spec, boolean previousPaid, List<String> errors) {
        if (!table.isObject()) {
            errors.add(spec.field() + ": falta el estado de la " + spec.label());
            return false;
        }
        List<String> tableErrors = new ArrayList<>();
        double balance = number(table, "balance", tableErrors);
        double playTime = number(table, "playTime", tableErrors);
        if (table.has("pot")) number(table, "pot", tableErrors);
        Map<String, Integer> levels = new LinkedHashMap<>();
        JsonNode ups = table.path("upgrades");
        if (!ups.isObject()) {
            tableErrors.add("upgrades: falta el objeto de mejoras");
        } else {
            ups.fieldNames().forEachRemaining(id -> {
                if (!spec.upgrades().containsKey(id)) tableErrors.add("upgrades." + id + ": mejora desconocida");
            });
            for (var e : spec.upgrades().entrySet()) {
                JsonNode level = ups.path(e.getKey());
                if (level.isMissingNode()) {
                    levels.put(e.getKey(), 0);
                } else if (!level.isIntegralNumber() || !level.canConvertToInt()) {
                    tableErrors.add("upgrades." + e.getKey() + ": debe ser un entero");
                } else if (level.asInt() < 0 || level.asInt() > e.getValue().maxLevel()) {
                    tableErrors.add("upgrades." + e.getKey() + ": nivel " + level.asInt() + " fuera de 0-" + e.getValue().maxLevel());
                } else {
                    levels.put(e.getKey(), level.asInt());
                }
            }
            if (levels.getOrDefault(spec.helperId(), 0) == 0) {
                for (String id : NEED_HELPER) {
                    if (levels.getOrDefault(id, 0) > 0) tableErrors.add("upgrades." + id + ": requiere " + spec.helperName());
                }
            }
        }
        JsonNode profile = table.path("helper").path("profile");
        if (!profile.isMissingNode()) {
            int unlocked = Math.min(levels.getOrDefault("helperProfile", 0), spec.helperProfiles() - 1);
            if (!profile.isInt() || profile.asInt() < 0 || profile.asInt() > unlocked) {
                tableErrors.add("helper.profile: perfil no desbloqueado");
            }
        }
        JsonNode paid = table.path("debtPaid");
        if (!paid.isMissingNode() && !paid.isBoolean()) tableErrors.add("debtPaid: debe ser true o false");
        boolean started = balance > 0 || playTime > 0 || paid.asBoolean(false)
                || levels.values().stream().anyMatch(level -> level > 0);
        if (started && !previousPaid) tableErrors.add("hay progreso en la " + spec.label() + " sin la deuda de la " + spec.previous() + " pagada");
        for (String error : tableErrors) errors.add(spec.field() + "." + error);
        return paid.asBoolean(false);
    }

    /**
     * Mesa 5: herencias (enteros de 0 al nivel máximo, solo con la mesa abierta) y moneda elegida
     * (justa o cargada; la cargada solo con su mejora). Faltar es válido: el cliente lo rellena.
     */
    private void parseCoinExtras(JsonNode coin, boolean open, List<String> errors) {
        if (!coin.isObject()) return;
        JsonNode heirlooms = coin.path("heirlooms");
        if (!heirlooms.isMissingNode()) {
            if (!heirlooms.isObject()) {
                errors.add("coin.heirlooms: debe ser un objeto");
            } else {
                heirlooms.fieldNames().forEachRemaining(id -> {
                    if (!rules.coinHeirlooms().containsKey(id)) errors.add("coin.heirlooms." + id + ": herencia desconocida");
                });
                for (var e : rules.coinHeirlooms().entrySet()) {
                    JsonNode level = heirlooms.path(e.getKey());
                    if (level.isMissingNode()) continue;
                    if (!level.isIntegralNumber() || !level.canConvertToInt()) {
                        errors.add("coin.heirlooms." + e.getKey() + ": debe ser un entero");
                    } else if (level.asInt() < 0 || level.asInt() > e.getValue()) {
                        errors.add("coin.heirlooms." + e.getKey() + ": nivel " + level.asInt() + " fuera de 0-" + e.getValue());
                    } else if (level.asInt() > 0 && !open) {
                        errors.add("coin.heirlooms." + e.getKey() + ": la mesa 5 no está abierta");
                    }
                }
            }
        }
        JsonNode choice = coin.path("coinChoice");
        if (!choice.isMissingNode()) {
            String kind = choice.isTextual() ? choice.asText() : "";
            if (!kind.equals("justa") && !kind.equals("cargada")) {
                errors.add("coin.coinChoice: debe ser justa o cargada");
            } else if (kind.equals("cargada") && coin.path("upgrades").path("loaded").asInt(0) < 1) {
                errors.add("coin.coinChoice: la moneda cargada requiere su mejora");
            }
        }
    }

    /**
     * Pantalla final (guardado v11): `endingSeen` es true o false y solo puede ser true con la deuda del
     * Dueño pagada; `stats.paidAt` son 5 tiempos (0 = sin pagar, -1 = pagada antes de guardarse, o un
     * tiempo de juego hasta el total) y solo una mesa pagada tiene tiempo. Faltar es válido.
     */
    private static void parseEnding(JsonNode state, boolean[] paid, double playTime, List<String> errors) {
        JsonNode seen = state.path("endingSeen");
        if (!seen.isMissingNode()) {
            if (!seen.isBoolean()) errors.add("endingSeen: debe ser true o false");
            else if (seen.asBoolean() && !paid[4]) errors.add("endingSeen: el final requiere la deuda de la mesa 5 pagada");
        }
        JsonNode paidAt = state.path("stats").path("paidAt");
        if (paidAt.isMissingNode()) return;
        if (!paidAt.isArray() || paidAt.size() != paid.length) {
            errors.add("stats.paidAt: debe ser una lista de 5 tiempos");
            return;
        }
        for (int i = 0; i < paid.length; i++) {
            JsonNode t = paidAt.get(i);
            double value = t.isNumber() ? t.asDouble() : Double.NaN;
            if (!(value == -1 || (value >= 0 && value <= playTime + 1))) {
                errors.add("stats.paidAt[" + i + "]: debe ser -1, 0 o un tiempo de juego hasta el total");
            } else if (value != 0 && !paid[i]) {
                errors.add("stats.paidAt[" + i + "]: hay tiempo de pago sin la deuda de la mesa " + (i + 1) + " pagada");
            }
        }
    }

    /**
     * Mesa 5 (guardado v12, multiplicadores acumulativos): cada cadena guardada (la del jugador, la del
     * diablillo y las recientes) es null o un objeto con `wins` y `decay` enteros no negativos y `value`
     * un número finito no negativo; el campo `fatigue` de la v11 ya no existe (pasó a `decay`).
     */
    private static void parseCoinChains(JsonNode coin, List<String> errors) {
        if (!coin.isObject()) return;
        List<JsonNode> chains = new ArrayList<>();
        List<String> names = new ArrayList<>();
        chains.add(coin.path("chain"));
        names.add("coin.chain");
        chains.add(coin.path("helper").path("chain"));
        names.add("coin.helper.chain");
        JsonNode recent = coin.path("recentChains");
        if (recent.isArray()) {
            for (int i = 0; i < recent.size(); i++) {
                chains.add(recent.get(i));
                names.add("coin.recentChains[" + i + "]");
            }
        }
        for (int i = 0; i < chains.size(); i++) {
            JsonNode chain = chains.get(i);
            String name = names.get(i);
            if (chain.isMissingNode() || chain.isNull()) continue;
            if (!chain.isObject()) {
                errors.add(name + ": debe ser un objeto o null");
                continue;
            }
            if (chain.has("fatigue")) errors.add(name + ".fatigue: campo de una versión anterior (ahora decay)");
            for (String field : new String[] {"wins", "decay"}) {
                JsonNode n = chain.path(field);
                if (!n.isMissingNode() && (!n.isIntegralNumber() || n.asLong() < 0 || n.asLong() > 1000)) {
                    errors.add(name + "." + field + ": debe ser un entero no negativo");
                }
            }
            JsonNode value = chain.path("value");
            if (!value.isMissingNode() && (!value.isNumber() || !Double.isFinite(value.asDouble()) || value.asDouble() < 0 || value.asDouble() > MAX_SANE_NUMBER)) {
                errors.add(name + ".value: debe ser un número finito no negativo");
            }
        }
    }

    private static double number(JsonNode state, String field, List<String> errors) {
        JsonNode node = state.path(field);
        if (!node.isNumber()) {
            errors.add(field + ": debe ser un número");
            return 0;
        }
        double value = node.asDouble();
        if (!Double.isFinite(value) || value < 0 || value > MAX_SANE_NUMBER) {
            errors.add(field + ": debe ser un número finito entre 0 y 1e15");
        }
        return value;
    }

    private static String fmt(double value) {
        NumberFormat f = NumberFormat.getIntegerInstance(Locale.forLanguageTag("es-ES"));
        return f.format(Math.floor(value));
    }
}
