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
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Límite de intentos por IP en login y registro (Bucket4j). Los cubos caducan tras 10 minutos
 * sin uso para que el mapa no crezca sin control.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Set<String> LIMITED_PATHS = Set.of("/api/auth/login", "/api/auth/register");

    private final int perMinute;
    private final ObjectMapper mapper;
    private final Cache<String, Bucket> buckets =
            Caffeine.newBuilder().expireAfterAccess(10, TimeUnit.MINUTES).maximumSize(100_000).build();

    public RateLimitFilter(AppProperties props, ObjectMapper mapper) {
        this.perMinute = props.rateLimit().authPerMinute();
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !LIMITED_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Bucket bucket = buckets.get(request.getRemoteAddr(), ip -> Bucket.builder()
                .addLimit(Bandwidth.builder().capacity(perMinute).refillGreedy(perMinute, Duration.ofMinutes(1)).build())
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
