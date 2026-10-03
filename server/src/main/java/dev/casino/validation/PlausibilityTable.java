package dev.casino.validation;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Límites estadísticos generados por el simulador del juego (npm run plausibility).
 * maxEarned[k] = fichas ganadas como mínimo que se consideran plausibles a los
 * k * sampleEverySeconds segundos de juego.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PlausibilityTable(
        String configHash,
        double sampleEverySeconds,
        double horizonSeconds,
        double minDebtSeconds,
        double maxEarnedPerSecondAfterHorizon,
        double earnedMargin,
        double timeMargin,
        double[] maxEarned) {

    /**
     * Máximo plausible a ese tiempo de juego. Usa el siguiente punto de la tabla (redondeo hacia
     * arriba, a favor del jugador); más allá del horizonte, extrapola con el ritmo máximo.
     */
    public double maxEarnedAt(double playTime) {
        if (playTime >= horizonSeconds) {
            return maxEarned[maxEarned.length - 1] + (playTime - horizonSeconds) * maxEarnedPerSecondAfterHorizon;
        }
        int index = (int) Math.ceil(Math.max(playTime, 0) / sampleEverySeconds);
        return maxEarned[Math.min(index, maxEarned.length - 1)];
    }
}
