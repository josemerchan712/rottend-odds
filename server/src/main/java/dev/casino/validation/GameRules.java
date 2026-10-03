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

    public record Work(int maxItems, double respawnSeconds, double maxItemValue) {}

    private final int saveVersion;
    private final double debtAmount;
    private final int helperProfiles;
    private final Map<String, Upgrade> upgrades;
    private final Work work;
    private final PlausibilityTable plausibility;

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
        JsonNode w = config.path("work");
        this.work = new Work(w.path("maxItems").asInt(), w.path("respawnSeconds").asDouble(), w.path("maxItemValue").asDouble());

        this.plausibility = mapper.readValue(read("shared/plausibility.json"), PlausibilityTable.class);
        String hash = configHash(configText);
        if (!hash.equals(plausibility.configHash())) {
            throw new IllegalStateException("shared/plausibility.json no corresponde a shared/config.json: "
                    + "regenérala con `npm run plausibility`");
        }
        if (saveVersion <= 0 || debtAmount <= 0 || upgrades.isEmpty()) {
            throw new IllegalStateException("shared/config.json incompleto");
        }
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
     * respawnSeconds, todos del valor más alto. Es un límite físico, no estadístico.
     */
    public double workCeiling(double playTime) {
        return (work.maxItems() + Math.floor(playTime / work.respawnSeconds())) * work.maxItemValue();
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
}
