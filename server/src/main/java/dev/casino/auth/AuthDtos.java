package dev.casino.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/** Peticiones y respuestas de /api/auth y /api/me. */
public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 10, max = 128, message = "debe tener entre 10 y 128 caracteres") String password,
            @NotBlank
            @Size(min = 3, max = 20, message = "debe tener entre 3 y 20 caracteres")
            @Pattern(regexp = "^[\\p{L}\\p{N} _.-]+$", message = "solo letras, números, espacios, '_', '.' y '-'")
            String displayName) {

        /** Sin la contraseña. */
        @Override
        public String toString() {
            return "RegisterRequest[displayName=" + displayName + "]";
        }
    }

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {

        @Override
        public String toString() {
            return "LoginRequest[***]";
        }
    }

    public record TokenResponse(String token, Instant expiresAt, String displayName) {

        @Override
        public String toString() {
            return "TokenResponse[displayName=" + displayName + ", expiresAt=" + expiresAt + "]";
        }
    }

    public record MeResponse(UUID id, String email, String displayName, Instant createdAt) {}
}
