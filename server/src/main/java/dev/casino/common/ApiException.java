package dev.casino.common;

import java.util.List;
import org.springframework.http.HttpStatus;

/** Error de negocio con su código HTTP, opcionalmente motivos y sugerencias. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final List<String> details;
    private final List<String> suggestions;

    public ApiException(HttpStatus status, String message) {
        this(status, message, List.of(), List.of());
    }

    public ApiException(HttpStatus status, String message, List<String> details) {
        this(status, message, details, List.of());
    }

    public ApiException(HttpStatus status, String message, List<String> details, List<String> suggestions) {
        super(message);
        this.status = status;
        this.details = List.copyOf(details);
        this.suggestions = List.copyOf(suggestions);
    }

    public HttpStatus status() {
        return status;
    }

    public List<String> details() {
        return details;
    }

    public List<String> suggestions() {
        return suggestions;
    }
}
