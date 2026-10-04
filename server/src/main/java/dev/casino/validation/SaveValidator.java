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
 * Las mesas 2 (tragaperras) y 3 (dados) solo pasan la capa 1: estructura, niveles de sus mejoras y
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
        parseTable(state.path("dice"), new TableSpec("dice", "mesa 3", rules.diceUpgrades(), "ghost",
                "el camarero fantasma", rules.diceHelperProfiles(), "mesa 2"), debtPaid && slotsPaid, errors);
        JsonNode active = state.path("activeTable");
        if (!active.isMissingNode() && (!active.isInt() || active.asInt() < 1 || active.asInt() > 3)) {
            errors.add("activeTable: debe ser 1, 2 o 3");
        } else if (active.asInt(1) == 2 && !debtPaid) {
            errors.add("activeTable: la mesa 2 requiere la deuda de la mesa 1 pagada");
        } else if (active.asInt(1) == 3 && !(debtPaid && slotsPaid)) {
            errors.add("activeTable: la mesa 3 requiere la deuda de la mesa 2 pagada");
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
