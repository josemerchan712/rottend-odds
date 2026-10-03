package dev.casino.ranking;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public final class RankingDtos {

    private RankingDtos() {}

    public record DebtPaidRequest(
            @NotNull @Schema(description = "La partida en el momento de pagar la deuda: {version, savedAt, state}")
            JsonNode data) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DebtPaidResponse(
            double playTimeSeconds,
            @Schema(description = "false si el resultado es implausible: se guarda, pero no aparece en el ranking")
            boolean verified,
            String verificationNote,
            @Schema(description = "Puesto del mejor resultado del usuario (solo si está verificado)")
            Long rank,
            @Schema(description = "true si este resultado mejora el que ya tenía")
            boolean newBest) {}

    /** Fila tal como sale de la base de datos. */
    public record Row(String displayName, double playTimeSeconds, Instant achievedAt) {}

    public record Entry(long rank, String displayName, double playTimeSeconds, Instant achievedAt) {}

    public record Page(List<Entry> content, int page, int size, long totalElements, int totalPages) {}
}
