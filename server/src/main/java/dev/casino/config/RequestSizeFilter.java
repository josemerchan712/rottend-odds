package dev.casino.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.casino.common.ApiError;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Límite de tamaño de las peticiones (`app.max-request-bytes`, 128 KB por defecto; el guardado más grande
 * admitido son 64 KB). Se rechaza antes de leer el cuerpo: 413 si `Content-Length` lo supera y 411 si llega
 * un cuerpo sin longitud (troceado), algo que el cliente del juego nunca hace. En producción Caddy aplica
 * además su propio límite.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RequestSizeFilter extends OncePerRequestFilter {

    private final long maxBytes;
    private final ObjectMapper mapper;

    public RequestSizeFilter(@Value("${app.max-request-bytes:131072}") long maxBytes, ObjectMapper mapper) {
        this.maxBytes = maxBytes;
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long length = request.getContentLengthLong();
        if (length > maxBytes) {
            reject(response, HttpStatus.PAYLOAD_TOO_LARGE, "La petición es demasiado grande");
            return;
        }
        if (length < 0 && request.getHeader("Transfer-Encoding") != null) {
            reject(response, HttpStatus.LENGTH_REQUIRED, "Falta Content-Length");
            return;
        }
        chain.doFilter(request, response);
    }

    private void reject(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setHeader("Connection", "close");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), ApiError.of(status, message));
    }
}
