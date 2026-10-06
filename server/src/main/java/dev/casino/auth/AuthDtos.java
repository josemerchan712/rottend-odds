package dev.casino.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Peticiones y respuestas de /api/auth y /api/me. Sin email: el nombre de jugador es el identificador. */
public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Size(max = 40) String playerName,
            @NotBlank @Size(min = 10, max = 128, message = "debe tener entre 10 y 128 caracteres") String password) {

        /** Sin la contraseña. */
        @Override
        public String toString() {
            return "RegisterRequest[***]";
        }
    }

    public record LoginRequest(@NotBlank @Size(max = 40) String playerName, @NotBlank @Size(max = 128) String password) {

        @Override
        public String toString() {
            return "LoginRequest[***]";
        }
    }

    /** Restablecer la contraseña con el código de recuperación (sin email). */
    public record ResetRequest(
            @NotBlank @Size(max = 40) String playerName,
            @NotBlank @Size(max = 40) String recoveryCode,
            @NotBlank @Size(min = 10, max = 128, message = "debe tener entre 10 y 128 caracteres") String newPassword) {

        @Override
        public String toString() {
            return "ResetRequest[***]";
        }
    }

    /**
     * Sesión iniciada. `recoveryCode` solo viene al registrarse y al restablecer la contraseña: es la única vez
     * que se ve (en la base de datos solo queda su hash).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TokenResponse(String token, Instant expiresAt, String playerName, String recoveryCode) {

        public TokenResponse(String token, Instant expiresAt, String playerName) {
            this(token, expiresAt, playerName, null);
        }

        public TokenResponse withRecoveryCode(String code) {
            return new TokenResponse(token, expiresAt, playerName, code);
        }

        @Override
        public String toString() {
            return "TokenResponse[***]";
        }
    }

    /** Disponibilidad de un nombre mientras se escribe. `reason`: ocupado, reservado, no-permitido o formato. */
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    public record NameCheckResponse(String playerName, boolean available, String reason, String message, List<String> suggestions) {}

    public record MeResponse(UUID id, String playerName, Instant createdAt) {}
}
