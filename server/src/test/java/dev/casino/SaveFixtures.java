package dev.casino;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/** Guardados de prueba con la misma forma que los que genera el juego (src/game/save.ts). */
public final class SaveFixtures {

    private SaveFixtures() {}

    public static Map<String, Object> upgrades() {
        Map<String, Object> ups = new LinkedHashMap<>();
        for (String id : new String[] {"luck", "maxBet", "crupier", "helperSpeed", "helperProfile", "helperLuck",
                "jackpot", "dozenBet", "numberBet"}) {
            ups.put(id, 0);
        }
        return ups;
    }

    /** Una partida en curso, plausible: poco dinero, pocas mejoras. */
    public static Map<String, Object> save(double balance, double playTime) {
        return save(balance, playTime, upgrades(), false);
    }

    public static Map<String, Object> save(double balance, double playTime, Map<String, Object> upgrades, boolean debtPaid) {
        Map<String, Object> state = new HashMap<>();
        state.put("balance", balance);
        state.put("playTime", playTime);
        state.put("upgrades", upgrades);
        state.put("betFractionIndex", 1);
        state.put("helper", Map.of("timer", 0, "lockout", 0, "profile", 0));
        state.put("work", Map.of("items", 6, "spawnTimer", 0));
        state.put("recentSpins", java.util.List.of());
        state.put("debtPaid", debtPaid);
        state.put("stats", Map.of("bets", 0, "wins", 0, "jackpots", 0, "jackpotsCapped", 0, "workEarned", 0));
        Map<String, Object> file = new HashMap<>();
        file.put("version", 3);
        file.put("savedAt", 1_700_000_000_000L);
        file.put("state", state);
        return file;
    }

    /** Una mesa terminada en un tiempo normal (~8 min) y con lo que sobra tras pagar. */
    public static Map<String, Object> finished(double playTime) {
        Map<String, Object> ups = upgrades();
        ups.put("luck", 20);
        ups.put("maxBet", 11);
        ups.put("crupier", 1);
        ups.put("helperSpeed", 15);
        return save(50_000, playTime, ups, true);
    }
}
