package dev.casino.common;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Traduce excepciones a {@link ApiError}. Nunca devuelve el cuerpo de la petición: podría
 * contener una contraseña.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.status()).body(ApiError.of(ex.status(), ex.getMessage(), ex.details(), ex.suggestions()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .sorted()
                .toList();
        return ResponseEntity.badRequest().body(ApiError.of(HttpStatus.BAD_REQUEST, "Datos no válidos", details));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ApiError> handleUnreadable(Exception ex) {
        return ResponseEntity.badRequest().body(ApiError.of(HttpStatus.BAD_REQUEST, "La petición no se puede leer"));
    }
}
