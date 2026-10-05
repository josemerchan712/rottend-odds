package dev.casino.validation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Los números del juego que necesita la validación, leídos de shared/config.json, y la tabla de
 * plausibilidad de shared/plausibility.json (ambos empaquetados en el classpath por Maven).
 * Si la tabla se generó con otra config.json, el servidor no arranca.
 */
@Component
public class GameRules {

    public record Upgrade(double baseCost, double growth, int maxLevel) {}

    public record Work(int maxItems, double respawnSeconds, double maxItemValue, double bagValuePerLevel) {}

    private final int saveVersion;
    private final double debtAmount;
    private final int helperProfiles;
    private final Map<String, Upgrade> upgrades;
    private final Work work;
    private final PlausibilityTable plausibility;
    /** Mesa 2 (tragaperras): solo lo que hace falta para la validación estructural. */
    private final Map<String, Upgrade> slotsUpgrades;
    private final int slotsHelperProfiles;
    /** Mesa 3 (dados): igual, solo estructura. */
    private final Map<String, Upgrade> diceUpgrades;
    private final int diceHelperProfiles;
    /** Mesa 4 (blackjack): igual, solo estructura. */
    private final Map<String, Upgrade> cardsUpgrades;
    private final int cardsHelperProfiles;
    /** Mesa 5 (doble o nada): solo lo que hace falta para la validación estructural. */
    private final Map<String, Upgrade> coinUpgrades;
    private final int coinHelperProfiles;

    public GameRules(ObjectMapper mapper) throws IOException {
        String configText = read("shared/config.json");
        JsonNode config = mapper.readTree(configText);
        this.saveVersion = config.path("saveVersion").asInt();
        this.debtAmount = config.path("debt").path("amount").asDouble();
        this.helperProfiles = config.path("helperProfiles").asInt();
        Map<String, Upgrade> ups = new LinkedHashMap<>();
        config.path("upgrades").fields().forEachRemaining(e -> ups.put(e.getKey(), new Upgrade(
                e.getValue().path("baseCost").asDouble(),
                e.getValue().path("growth").asDouble(),
                e.getValue().path("maxLevel").asInt())));
        this.upgrades = Collections.unmodifiableMap(ups);
        JsonNode slots = config.path("slots");
        this.slotsUpgrades = Collections.unmodifiableMap(readUpgrades(slots.path("upgrades")));
        this.slotsHelperProfiles = slots.path("helperProfiles").asInt();
        JsonNode dice = config.path("dice");
        this.diceUpgrades = Collections.unmodifiableMap(readUpgrades(dice.path("upgrades")));
        this.diceHelperProfiles = dice.path("helperProfiles").asInt();
        JsonNode cards = config.path("cards");
        this.cardsUpgrades = Collections.unmodifiableMap(readUpgrades(cards.path("upgrades")));
        this.cardsHelperProfiles = cards.path("helperProfiles").asInt();
        JsonNode coin = config.path("coin");
        this.coinUpgrades = Collections.unmodifiableMap(readUpgrades(coin.path("upgrades")));
        this.coinHelperProfiles = coin.path("helperProfiles").asInt();
        JsonNode w = config.path("work");
        this.work = new Work(w.path("maxItems").asInt(), w.path("respawnSeconds").asDouble(),
                w.path("maxItemValue").asDouble(), w.path("bagValuePerLevel").asDouble());

        this.plausibility = mapper.readValue(read("shared/plausibility.json"), PlausibilityTable.class);
        String hash = configHash(configText);
        if (!hash.equals(plausibility.configHash())) {
            throw new IllegalStateException("shared/plausibility.json no corresponde a shared/config.json: "
                    + "regenérala con `npm run plausibility`");
        }
        if (saveVersion <= 0 || debtAmount <= 0 || upgrades.isEmpty() || slotsUpgrades.isEmpty() || diceUpgrades.isEmpty() || cardsUpgrades.isEmpty() || coinUpgrades.isEmpty()) {
            throw new IllegalStateException("shared/config.json incompleto");
        }
    }

    private static Map<String, Upgrade> readUpgrades(JsonNode node) {
        Map<String, Upgrade> out = new LinkedHashMap<>();
        node.fields().forEachRemaining(e -> out.put(e.getKey(), new Upgrade(
                e.getValue().path("baseCost").asDouble(),
                e.getValue().path("growth").asDouble(),
                e.getValue().path("maxLevel").asInt())));
        return out;
    }

    /** Igual que sim/plausibility-hash.ts: SHA-256 del texto con saltos de línea normalizados. */
    public static String configHash(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(text.replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String read(String path) throws IOException {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /** coste(n) = base * crecimiento^n, redondeado como Math.round de JavaScript (para positivos). */
    public double upgradeCost(String id, int level) {
        Upgrade u = upgrades.get(id);
        return Math.round(u.baseCost() * Math.pow(u.growth(), level));
    }

    /** Lo que cuesta llegar a esos niveles de mejora. */
    public double spentOn(Map<String, Integer> levels) {
        double total = 0;
        for (var e : levels.entrySet()) {
            for (int n = 0; n < e.getValue(); n++) total += upgradeCost(e.getKey(), n);
        }
        return total;
    }

    /**
     * Lo máximo que puede dar la basura en ese tiempo: los objetos iniciales más uno cada
     * respawnSeconds, todos del valor más alto y con la bolsa grande al máximo. Las pinzas y el
     * ayudante de limpieza no cambian este límite: solo recogen lo que aparece. Es un límite físico,
     * no estadístico.
     */
    public double workCeiling(double playTime) {
        Upgrade bag = upgrades.get("bigBag");
        double bagMultiplier = 1 + work.bagValuePerLevel() * (bag == null ? 0 : bag.maxLevel());
        return (work.maxItems() + Math.floor(playTime / work.respawnSeconds())) * work.maxItemValue() * bagMultiplier;
    }

    public int saveVersion() {
        return saveVersion;
    }

    public double debtAmount() {
        return debtAmount;
    }

    public int helperProfiles() {
        return helperProfiles;
    }

    public Map<String, Upgrade> upgrades() {
        return upgrades;
    }

    public PlausibilityTable plausibility() {
        return plausibility;
    }

    public Map<String, Upgrade> slotsUpgrades() {
        return slotsUpgrades;
    }

    public int slotsHelperProfiles() {
        return slotsHelperProfiles;
    }

    public Map<String, Upgrade> diceUpgrades() {
        return diceUpgrades;
    }

    public int diceHelperProfiles() {
        return diceHelperProfiles;
    }

    public Map<String, Upgrade> cardsUpgrades() {
        return cardsUpgrades;
    }

    public int cardsHelperProfiles() {
        return cardsHelperProfiles;
    }

    public Map<String, Upgrade> coinUpgrades() {
        return coinUpgrades;
    }

    public int coinHelperProfiles() {
        return coinHelperProfiles;
    }
}
