package dev.casino.save;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public final class SaveDtos {

    private SaveDtos() {}

    public record SaveRequest(
            @Schema(description = "Revisión del guardado de la nube en la que se basa el cliente; null si no tenía ninguno. "
                    + "Si no coincide con la del servidor, la respuesta es 409 con el guardado del servidor.")
            Long baseRevision,
            @NotNull
            @Schema(description = "La partida tal como la serializa el juego: {version, savedAt, state}")
            JsonNode data) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SaveResponse(
            long revision,
            int saveVersion,
            JsonNode data,
            double playTime,
            double balance,
            boolean debtPaid,
            @Schema(description = "false si el guardado es posible pero estadísticamente implausible: se acepta, "
                    + "pero no cuenta para el ranking")
            boolean verified,
            String verificationNote,
            Instant updatedAt) {}

    /** Cuerpo del 409: el cliente decide si se queda con el guardado del servidor o lo sobrescribe. */
    public record ConflictResponse(int status, String error, String message, SaveResponse server) {}
}
