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
 * Igual que en producción, pero con el proxy de confianza en 127.0.0.1 (aquí hace de Caddy): entonces el
 * límite de intentos cuenta por la IP de X-Forwarded-For, la del cliente real.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.tomcat.remoteip.internal-proxies=127\\.0\\.0\\.1|0:0:0:0:0:0:0:1")
@ActiveProfiles({"prod", "test"})
class TrustedProxyTest {

    private final HttpClient http = HttpClient.newHttpClient();

    @LocalServerPort
    int port;

    private int check(String clientIp) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/auth/name-available?name=Libre"))
                .header("X-Forwarded-For", clientIp)
                .build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    @Test
    void cuentaPorLaIpRealDelCliente() throws Exception {
        for (int i = 0; i < 8; i++) assertThat(check("203.0.113.7")).isEqualTo(200);
        assertThat(check("203.0.113.7")).isEqualTo(429);
        // Otro cliente detrás del mismo proxy tiene su propio cubo.
        assertThat(check("198.51.100.20")).isEqualTo(200);
        // Si el cliente intenta colar una IP falsa delante, Caddy la deja a la izquierda y cuenta la última no confiable.
        assertThat(check("203.0.113.99, 203.0.113.7")).isEqualTo(429);
    }
}
