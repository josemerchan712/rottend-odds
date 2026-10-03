package dev.casino.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Documentación en /swagger-ui.html y /v3/api-docs. */
@Configuration
public class OpenApiConfig {

    public static final String BEARER = "bearer";

    @Bean
    OpenAPI casinoOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Casino incremental · API")
                        .version("0.1.0")
                        .description("Cuentas, guardado en la nube con control de conflictos, ranking de la mesa 1 "
                                + "y validación de plausibilidad. El juego funciona sin este servidor."))
                .components(new Components().addSecuritySchemes(BEARER, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")));
    }
}
