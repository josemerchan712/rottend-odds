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

    /** Registra un usuario nuevo y devuelve su token. */
    protected String registerUser() throws Exception {
        String name = unique("jugador");
        String body = mvc.perform(jsonPost("/api/auth/register",
                        Map.of("email", name + "@example.com", "password", "contraseña-larga", "displayName", name)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("token").asText();
    }

    protected static String bearer(String token) {
        return "Bearer " + token;
    }

    protected JsonNode readJson(String body) throws Exception {
        return json.readTree(body);
    }
}
