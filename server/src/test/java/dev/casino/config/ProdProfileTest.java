package dev.casino.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/**
 * Perfil de producción de verdad (con la base H2 de los tests encima) y Tomcat real: la petición llega desde
 * 127.0.0.1, que NO es la IP de Caddy, así que X-Forwarded-For se tiene que ignorar.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"prod", "test"})
class ProdProfileTest {

    private final HttpClient http = HttpClient.newHttpClient();

    @LocalServerPort
    int port;

    private HttpResponse<String> get(String path, String... headers) throws Exception {
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (headers.length > 0) req.headers(headers);
        return http.send(req.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void healthPublicoYMinimo() throws Exception {
        var res = get("/health");
        assertThat(res.statusCode()).isEqualTo(200);
        assertThat(res.body()).isEqualTo("{\"status\":\"ok\"}");
    }

    @Test
    void sinDocumentacionPublica() throws Exception {
        assertThat(get("/v3/api-docs").statusCode()).isNotEqualTo(200);
        assertThat(get("/swagger-ui.html").statusCode()).isNotEqualTo(200);
        assertThat(get("/swagger-ui/index.html").statusCode()).isNotEqualTo(200);
    }

    @Test
    void cabecerasDeSeguridad() throws Exception {
        var headers = get("/api/ranking").headers();
        assertThat(headers.firstValue("X-Content-Type-Options")).contains("nosniff");
        assertThat(headers.firstValue("X-Frame-Options")).contains("DENY");
        assertThat(headers.firstValue("Content-Security-Policy")).contains("default-src 'none'; frame-ancestors 'none'");
        assertThat(headers.firstValue("Referrer-Policy")).contains("no-referrer");
    }

    @Test
    void peticionDemasiadoGrande() throws Exception {
        String body = "{\"data\":\"" + "x".repeat(200_000) + "\"}";
        var res = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(), HttpResponse.BodyHandlers.ofString());
        assertThat(res.statusCode()).isEqualTo(413);
    }

    @Test
    void xForwardedForDeFueraDeCaddySeIgnora() throws Exception {
        // El límite de disponibilidad en los tests es 8 por minuto. Cambiar la cabecera no da cubos nuevos.
        int last = 0;
        for (int i = 0; i < 9; i++) {
            last = get("/api/auth/name-available?name=Libre" + i, "X-Forwarded-For", "203.0.113." + i).statusCode();
        }
        assertThat(last).isEqualTo(429);
    }
}
