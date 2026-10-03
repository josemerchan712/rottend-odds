package dev.casino.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuración propia del servidor (prefijo {@code app}). Los secretos llegan por variables de
 * entorno; si el secreto JWT falta o es corto, el servidor no arranca.
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Cors cors, RateLimit rateLimit, Save save) {

    public static final int MIN_JWT_SECRET_LENGTH = 32;

    public AppProperties {
        // Sin ninguna propiedad app.jwt.* el registro anidado ni se construye: también es un error.
        if (jwt == null) throw new IllegalStateException("Falta la variable de entorno JWT_SECRET");
        if (cors == null) cors = new Cors(java.util.List.of("http://localhost:5173"));
        if (rateLimit == null) rateLimit = new RateLimit(10);
        if (save == null) save = new Save(65_536);
    }

    public record Jwt(String secret, Duration ttl, String issuer) {
        public Jwt {
            if (secret == null || secret.isBlank()) {
                throw new IllegalStateException("Falta la variable de entorno JWT_SECRET");
            }
            if (secret.length() < MIN_JWT_SECRET_LENGTH) {
                throw new IllegalStateException(
                        "JWT_SECRET debe tener al menos " + MIN_JWT_SECRET_LENGTH + " caracteres");
            }
            if (ttl == null) ttl = Duration.ofHours(24);
            if (issuer == null) issuer = "casino-incremental";
        }

        /** Sin el secreto, para que nunca acabe en un log por accidente. */
        @Override
        public String toString() {
            return "Jwt[secret=***, ttl=" + ttl + ", issuer=" + issuer + "]";
        }
    }

    public record Cors(List<String> origins) {}

    public record RateLimit(int authPerMinute) {}

    public record Save(int maxBytes) {}
}
