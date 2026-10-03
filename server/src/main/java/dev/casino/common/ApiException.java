package dev.casino.common;

import java.util.List;
import org.springframework.http.HttpStatus;

/** Error de negocio con su código HTTP y, opcionalmente, una lista de motivos. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final List<String> details;

    public ApiException(HttpStatus status, String message) {
        this(status, message, List.of());
    }

    public ApiException(HttpStatus status, String message, List<String> details) {
        super(message);
        this.status = status;
        this.details = List.copyOf(details);
    }

    public HttpStatus status() {
        return status;
    }

    public List<String> details() {
        return details;
    }
}
