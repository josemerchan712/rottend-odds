package dev.casino.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Comprueba que el servidor lee los mismos números que el juego (shared/config.json). */
class GameRulesTest {

    private final GameRules rules;

    GameRulesTest() throws Exception {
        rules = new GameRules(new ObjectMapper());
    }

    @Test
    void laTablaDePlausibilidadCorrespondeALaConfigCompartida() throws Exception {
        String text = Files.readString(Path.of("..", "shared", "config.json"), StandardCharsets.UTF_8);
        assertThat(GameRules.configHash(text)).isEqualTo(rules.plausibility().configHash());
        // Los saltos de línea de Windows no cambian el hash.
        assertThat(GameRules.configHash(text.replace("\n", "\r\n"))).isEqualTo(GameRules.configHash(text));
    }

    @Test
    void leeLosNumerosDelJuego() {
        assertThat(rules.saveVersion()).isEqualTo(11);
        assertThat(rules.debtAmount()).isEqualTo(10_000_000);
        assertThat(rules.upgrades()).containsKeys("luck", "maxBet", "crupier", "dozenBet", "numberBet",
                "tweezers", "bigBag", "cleaner");
        assertThat(rules.upgrades().get("luck").maxLevel()).isEqualTo(20);
        assertThat(rules.helperProfiles()).isEqualTo(3);
    }

    @Test
    void costesIgualesQueEnElJuego() {
        // coste(n) = round(base * crecimiento^n), como src/game/upgrades.ts
        var luck = rules.upgrades().get("luck");
        assertThat(rules.upgradeCost("luck", 0)).isEqualTo(Math.round(luck.baseCost()));
        assertThat(rules.upgradeCost("luck", 10)).isEqualTo(Math.round(luck.baseCost() * Math.pow(luck.growth(), 10)));
        assertThat(rules.spentOn(Map.of("crupier", 1))).isEqualTo(rules.upgrades().get("crupier").baseCost());
        assertThat(rules.spentOn(Map.of("luck", 2)))
                .isEqualTo(rules.upgradeCost("luck", 0) + rules.upgradeCost("luck", 1));
    }

    @Test
    void limitesDePlausibilidad() {
        PlausibilityTable table = rules.plausibility();
        assertThat(table.earnedMargin()).isEqualTo(2);
        assertThat(table.timeMargin()).isEqualTo(0.5);
        // Redondea hacia arriba al siguiente punto de la tabla.
        assertThat(table.maxEarnedAt(1)).isEqualTo(table.maxEarned()[1]);
        assertThat(table.maxEarnedAt(10)).isEqualTo(table.maxEarned()[1]);
        // Más allá del horizonte crece con el ritmo máximo.
        double end = table.maxEarnedAt(table.horizonSeconds());
        assertThat(table.maxEarnedAt(table.horizonSeconds() + 100))
                .isEqualTo(end + 100 * table.maxEarnedPerSecondAfterHorizon());
        // Límite físico de la basura: 6 objetos iniciales + 1 cada 2 s, a 500 como mucho, con la
        // bolsa grande al máximo (x3 con 4 niveles de +50%).
        assertThat(rules.workCeiling(0)).isEqualTo(6 * 500 * 3);
        assertThat(rules.workCeiling(10)).isEqualTo(11 * 500 * 3);
    }
}
