package dev.casino.validation;

import com.fasterxml.jackson.databind.JsonNode;
import dev.casino.common.ApiException;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
 * La mesa 2 (tragaperras, guardado v5) solo pasa la capa 1: estructura, niveles de sus mejoras y que
 * no haya progreso en ella sin la deuda de la mesa 1 pagada. El ranking sigue siendo el de la mesa 1.
 */
@Component
public class SaveValidator {

    /** Mejoras que el juego solo deja comprar con el Crupier. */
    private static final Set<String> NEED_CRUPIER = Set.of("helperSpeed", "helperProfile", "helperLuck");
    /** Mesa 2: mejoras que requieren al empleado zombi. */
    private static final Set<String> NEED_ZOMBIE = Set.of("helperSpeed", "helperProfile", "helperLuck");
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

        JsonNode active = state.path("activeTable");
        if (!active.isMissingNode() && (!active.isInt() || (active.asInt() != 1 && active.asInt() != 2))) {
            errors.add("activeTable: debe ser 1 o 2");
        } else if (active.asInt(1) == 2 && !debtPaid) {
            errors.add("activeTable: la mesa 2 requiere la deuda de la mesa 1 pagada");
        }
        parseSlots(state.path("slots"), debtPaid, errors);
        return new Snapshot(version, balance, playTime, levels, debtPaid);
    }

    /** Mesa 2: estructura y niveles. Sin la deuda de la mesa 1 pagada, debe estar sin empezar. */
    private void parseSlots(JsonNode slots, boolean table1Paid, List<String> errors) {
        if (!slots.isObject()) {
            errors.add("slots: falta el estado de la mesa 2");
            return;
        }
        List<String> slotErrors = new ArrayList<>();
        double balance = number(slots, "balance", slotErrors);
        double playTime = number(slots, "playTime", slotErrors);
        if (slots.has("pot")) number(slots, "pot", slotErrors);
        Map<String, Integer> levels = new LinkedHashMap<>();
        JsonNode ups = slots.path("upgrades");
        if (!ups.isObject()) {
            slotErrors.add("upgrades: falta el objeto de mejoras");
        } else {
            ups.fieldNames().forEachRemaining(id -> {
                if (!rules.slotsUpgrades().containsKey(id)) slotErrors.add("upgrades." + id + ": mejora desconocida");
            });
            for (var e : rules.slotsUpgrades().entrySet()) {
                JsonNode level = ups.path(e.getKey());
                if (level.isMissingNode()) {
                    levels.put(e.getKey(), 0);
                } else if (!level.isIntegralNumber() || !level.canConvertToInt()) {
                    slotErrors.add("upgrades." + e.getKey() + ": debe ser un entero");
                } else if (level.asInt() < 0 || level.asInt() > e.getValue().maxLevel()) {
                    slotErrors.add("upgrades." + e.getKey() + ": nivel " + level.asInt() + " fuera de 0-" + e.getValue().maxLevel());
                } else {
                    levels.put(e.getKey(), level.asInt());
                }
            }
            if (levels.getOrDefault("zombie", 0) == 0) {
                for (String id : NEED_ZOMBIE) {
                    if (levels.getOrDefault(id, 0) > 0) slotErrors.add("upgrades." + id + ": requiere el empleado zombi");
                }
            }
        }
        JsonNode profile = slots.path("helper").path("profile");
        if (!profile.isMissingNode()) {
            int unlocked = Math.min(levels.getOrDefault("helperProfile", 0), rules.slotsHelperProfiles() - 1);
            if (!profile.isInt() || profile.asInt() < 0 || profile.asInt() > unlocked) {
                slotErrors.add("helper.profile: perfil no desbloqueado");
            }
        }
        JsonNode paid = slots.path("debtPaid");
        if (!paid.isMissingNode() && !paid.isBoolean()) slotErrors.add("debtPaid: debe ser true o false");
        boolean started = balance > 0 || playTime > 0 || paid.asBoolean(false)
                || levels.values().stream().anyMatch(level -> level > 0);
        if (started && !table1Paid) slotErrors.add("hay progreso en la mesa 2 sin la deuda de la mesa 1 pagada");
        for (String error : slotErrors) errors.add("slots." + error);
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
