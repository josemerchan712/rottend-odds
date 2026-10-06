package dev.casino;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Base de los tests de endpoints: contexto completo con H2 y utilidades para crear usuarios. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class ApiTestSupport {

    private static final AtomicInteger COUNTER = new AtomicInteger();

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    /** Cada test usa una IP distinta para no chocar con el límite de intentos. */
    protected static RequestPostProcessor ip(String address) {
        return request -> {
            request.setRemoteAddr(address);
            return request;
        };
    }

    protected static String uniqueIp() {
        int n = COUNTER.incrementAndGet();
        return "10." + (n / 65536 % 256) + "." + (n / 256 % 256) + "." + (n % 256);
    }

    protected static String unique(String prefix) {
        return prefix + COUNTER.incrementAndGet();
    }

    protected MockHttpServletRequestBuilder jsonPost(String url, Object body) throws Exception {
        return post(url).with(ip(uniqueIp())).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }

    /** Contraseña de prueba de los tests (solo existe en la base H2 en memoria de los tests). */
    protected static final String PASSWORD = "contraseña-larga";

    /** Registra un usuario nuevo y devuelve su token. */
    protected String registerUser() throws Exception {
        return register(unique("jugador")).get("token").asText();
    }

    /** Registra un nombre y devuelve la respuesta (token, nombre y código de recuperación). */
    protected JsonNode register(String name) throws Exception {
        String body = mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", name, "password", PASSWORD)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    protected static String bearer(String token) {
        return "Bearer " + token;
    }

    protected JsonNode readJson(String body) throws Exception {
        return json.readTree(body);
    }
}
