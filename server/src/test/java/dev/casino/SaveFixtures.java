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
                "jackpot", "dozenBet", "numberBet", "tweezers", "bigBag", "cleaner"}) {
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
        state.put("work", Map.of("items", java.util.List.of(), "spawnTimer", 0, "nextId", 0,
                "cleaner", Map.of("timer", 0, "x", 600, "y", 344)));
        state.put("recentSpins", java.util.List.of());
        state.put("debtPaid", debtPaid);
        state.put("stats", Map.of("bets", 0, "wins", 0, "jackpots", 0, "jackpotsCapped", 0, "workEarned", 0));
        state.put("activeTable", 1);
        state.put("slots", slots(0, 0, slotUpgrades(), false));
        state.put("dice", dice(0, 0, diceUpgrades(), false));
        state.put("cards", cards(0, 0, cardsUpgrades(), false));
        state.put("coin", coin(0, 0, coinUpgrades(), false));
        state.put("endingSeen", false);
        Map<String, Object> file = new HashMap<>();
        file.put("version", 12);
        file.put("savedAt", 1_700_000_000_000L);
        file.put("state", state);
        return file;
    }

    public static Map<String, Object> slotUpgrades() {
        Map<String, Object> ups = new LinkedHashMap<>();
        for (String id : new String[] {"luck", "maxBet", "zombie", "helperSpeed", "helperProfile", "helperLuck",
                "jackpot", "hold"}) {
            ups.put(id, 0);
        }
        return ups;
    }

    /** La mesa 2 como la guarda el juego (src/game/slots/state.ts). */
    public static Map<String, Object> slots(double balance, double playTime, Map<String, Object> upgrades, boolean debtPaid) {
        Map<String, Object> slots = new HashMap<>();
        slots.put("balance", balance);
        slots.put("playTime", playTime);
        slots.put("upgrades", upgrades);
        slots.put("betFractionIndex", 1);
        slots.put("reels", java.util.List.of(0, 1, 3));
        slots.put("hold", null);
        slots.put("helper", Map.of("timer", 0, "profile", 0, "reels", java.util.List.of(4, 5, 0)));
        slots.put("pot", 50);
        slots.put("passiveCarry", 0);
        slots.put("recentSpins", java.util.List.of());
        slots.put("debtPaid", debtPaid);
        slots.put("stats", Map.of("spins", 0, "wins", 0, "jackpots", 0, "jackpotsCapped", 0, "holds", 0, "passiveEarned", 0));
        return slots;
    }

    public static Map<String, Object> diceUpgrades() {
        Map<String, Object> ups = new LinkedHashMap<>();
        for (String id : new String[] {"luck", "maxBet", "ghost", "helperSpeed", "helperProfile", "helperLuck",
                "jackpot", "hardTargets", "boxcars"}) {
            ups.put(id, 0);
        }
        return ups;
    }

    /** La mesa 3 como la guarda el juego (src/game/dice/state.ts). */
    public static Map<String, Object> dice(double balance, double playTime, Map<String, Object> upgrades, boolean debtPaid) {
        Map<String, Object> dice = new HashMap<>();
        dice.put("balance", balance);
        dice.put("playTime", playTime);
        dice.put("upgrades", upgrades);
        dice.put("betFractionIndex", 1);
        dice.put("target", "par");
        dice.put("dice", java.util.List.of(3, 4));
        dice.put("streak", 0);
        dice.put("rerolls", Map.of("charges", 1, "timer", 0));
        dice.put("helper", Map.of("timer", 0, "profile", 0, "streak", 0));
        dice.put("pot", 50);
        dice.put("passiveCarry", 0);
        dice.put("recentRolls", java.util.List.of());
        dice.put("debtPaid", debtPaid);
        dice.put("visited", false);
        return dice;
    }

    public static Map<String, Object> cardsUpgrades() {
        Map<String, Object> ups = new LinkedHashMap<>();
        for (String id : new String[] {"luck", "maxBet", "skeleton", "helperSpeed", "helperProfile", "helperLuck",
                "jackpot"}) {
            ups.put(id, 0);
        }
        return ups;
    }

    /** La mesa 4 como la guarda el juego (src/game/cards/state.ts). */
    public static Map<String, Object> cards(double balance, double playTime, Map<String, Object> upgrades, boolean debtPaid) {
        Map<String, Object> cards = new HashMap<>();
        cards.put("balance", balance);
        cards.put("playTime", playTime);
        cards.put("upgrades", upgrades);
        cards.put("betFractionIndex", 1);
        cards.put("hand", null);
        cards.put("discards", Map.of("charges", 1, "timer", 0));
        cards.put("helper", Map.of("timer", 0, "profile", 0));
        cards.put("pot", 50);
        cards.put("passiveCarry", 0);
        cards.put("recentHands", java.util.List.of());
        cards.put("debtPaid", debtPaid);
        cards.put("visited", false);
        return cards;
    }

    public static Map<String, Object> coinUpgrades() {
        Map<String, Object> ups = new LinkedHashMap<>();
        for (String id : new String[] {"luck", "maxBet", "imp", "helperSpeed", "helperProfile", "helperLuck", "temple", "loaded"}) {
            ups.put(id, 0);
        }
        return ups;
    }

    /** La mesa 5 como la guarda el juego (src/game/coin/state.ts). */
    public static Map<String, Object> coin(double balance, double playTime, Map<String, Object> upgrades, boolean debtPaid) {
        Map<String, Object> coin = new HashMap<>();
        coin.put("balance", balance);
        coin.put("playTime", playTime);
        coin.put("upgrades", upgrades);
        coin.put("betFractionIndex", 1);
        coin.put("chain", null);
        Map<String, Object> heirlooms = new LinkedHashMap<>();
        for (String id : new String[] {"zero", "hold", "reroll", "mark"}) heirlooms.put(id, 0);
        coin.put("heirlooms", heirlooms);
        coin.put("coinChoice", "justa");
        Map<String, Object> helper = new HashMap<>();
        helper.put("timer", 0);
        helper.put("profile", 0);
        helper.put("chain", null);
        helper.put("stopAt", 1);
        coin.put("helper", helper);
        coin.put("pot", 50);
        coin.put("passiveCarry", 0);
        coin.put("recentChains", java.util.List.of());
        coin.put("debtPaid", debtPaid);
        coin.put("visited", false);
        return coin;
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
