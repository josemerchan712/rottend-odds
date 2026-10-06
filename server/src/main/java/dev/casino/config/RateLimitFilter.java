package dev.casino.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import dev.casino.common.ApiError;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Límite de intentos por IP (Bucket4j), en dos grupos con cubos separados:
 * <ul>
 *   <li>credenciales: login, registro y restablecer la contraseña (`app.rate-limit.auth-per-minute`);</li>
 *   <li>consulta de disponibilidad del nombre (`app.rate-limit.name-check-per-minute`), para que no sirva para
 *       listar usuarios.</li>
 * </ul>
 * La IP es `getRemoteAddr()`: detrás de Caddy, Tomcat la sustituye por la del cliente (X-Forwarded-For) solo si
 * la petición llega del proxy de confianza (`server.tomcat.remoteip.internal-proxies`); si no, se ignora la
 * cabecera. Los cubos caducan tras 10 minutos sin uso para que el mapa no crezca sin control.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitFilter extends OncePerRequestFilter {

    private record Group(String name, int perMinute) {}

    private final Map<String, Group> limited;
    private final ObjectMapper mapper;
    private final Cache<String, Bucket> buckets =
            Caffeine.newBuilder().expireAfterAccess(10, TimeUnit.MINUTES).maximumSize(100_000).build();

    public RateLimitFilter(AppProperties props, ObjectMapper mapper) {
        Group credentials = new Group("auth", props.rateLimit().authPerMinute());
        Group nameCheck = new Group("name", props.rateLimit().nameCheckPerMinute());
        this.limited = Map.of(
                "POST /api/auth/login", credentials,
                "POST /api/auth/register", credentials,
                "POST /api/auth/reset", credentials,
                "GET /api/auth/name-available", nameCheck);
        this.mapper = mapper;
    }

    private Group groupOf(HttpServletRequest request) {
        return limited.get(request.getMethod() + " " + request.getRequestURI());
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return groupOf(request) == null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Group group = groupOf(request);
        Bucket bucket = buckets.get(group.name() + "|" + request.getRemoteAddr(), key -> Bucket.builder()
                .addLimit(Bandwidth.builder().capacity(group.perMinute()).refillGreedy(group.perMinute(), Duration.ofMinutes(1)).build())
                .build());
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            chain.doFilter(request, response);
            return;
        }
        long waitSeconds = Math.max(1, TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()));
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", String.valueOf(waitSeconds));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(),
                ApiError.of(HttpStatus.TOO_MANY_REQUESTS, "Demasiados intentos. Prueba de nuevo en " + waitSeconds + " s"));
    }
}
