package dev.casino.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * Cuerpo de error común a toda la API. `suggestions` solo aparece cuando hay alternativas que ofrecer (nombre
 * de jugador ocupado).
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(int status, String error, String message, List<String> details, List<String> suggestions, Instant timestamp) {

    public static ApiError of(HttpStatus status, String message) {
        return new ApiError(status.value(), status.getReasonPhrase(), message, List.of(), List.of(), Instant.now());
    }

    public static ApiError of(HttpStatus status, String message, List<String> details) {
        return new ApiError(status.value(), status.getReasonPhrase(), message, details, List.of(), Instant.now());
    }

    public static ApiError of(HttpStatus status, String message, List<String> details, List<String> suggestions) {
        return new ApiError(status.value(), status.getReasonPhrase(), message, details, suggestions, Instant.now());
    }
}
