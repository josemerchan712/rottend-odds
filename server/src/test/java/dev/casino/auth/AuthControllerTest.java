package dev.casino.auth;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.casino.ApiTestSupport;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class AuthControllerTest extends ApiTestSupport {

    private Map<String, String> registration(String name) {
        return Map.of("email", name + "@example.com", "password", "contraseña-larga", "displayName", name);
    }

    @Test
    void registroDevuelveTokenYNoExponeLaContraseña() throws Exception {
        String name = unique("ana");
        mvc.perform(jsonPost("/api/auth/register", registration(name)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.displayName").value(name))
                .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void emailYNombreRepetidosDan409() throws Exception {
        String name = unique("luis");
        mvc.perform(jsonPost("/api/auth/register", registration(name))).andExpect(status().isCreated());
        mvc.perform(jsonPost("/api/auth/register", registration(name))).andExpect(status().isConflict());
        // Mismo nombre con otras mayúsculas y otro email.
        mvc.perform(jsonPost("/api/auth/register",
                        Map.of("email", unique("otro") + "@example.com", "password", "contraseña-larga",
                                "displayName", name.toUpperCase())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Ese nombre ya está en uso"));
    }

    @Test
    void contraseñaCortaYNombreInvalidoDan400() throws Exception {
        mvc.perform(jsonPost("/api/auth/register",
                        Map.of("email", unique("a") + "@example.com", "password", "corta123", "displayName", unique("n"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details", hasItem(containsString("password"))));
        mvc.perform(jsonPost("/api/auth/register",
                        Map.of("email", unique("b") + "@example.com", "password", "contraseña-larga", "displayName", "ab")))
                .andExpect(status().isBadRequest());
        mvc.perform(jsonPost("/api/auth/register",
                        Map.of("email", unique("c") + "@example.com", "password", "contraseña-larga",
                                "displayName", "yo@mail.com")))
                .andExpect(status().isBadRequest());
        mvc.perform(jsonPost("/api/auth/register",
                        Map.of("email", "no-es-un-email", "password", "contraseña-larga", "displayName", unique("d"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginCorrectoEIncorrecto() throws Exception {
        String name = unique("eva");
        mvc.perform(jsonPost("/api/auth/register", registration(name))).andExpect(status().isCreated());

        mvc.perform(jsonPost("/api/auth/login", Map.of("email", name.toUpperCase() + "@EXAMPLE.com", "password", "contraseña-larga")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());

        // Mismo mensaje para contraseña mala y para email inexistente: no se delata qué cuentas existen.
        mvc.perform(jsonPost("/api/auth/login", Map.of("email", name + "@example.com", "password", "otra-contraseña")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Email o contraseña incorrectos"))
                .andExpect(jsonPath("$.message", not(containsString("otra-contraseña"))));
        mvc.perform(jsonPost("/api/auth/login", Map.of("email", "nadie@example.com", "password", "otra-contraseña")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Email o contraseña incorrectos"));
    }

    @Test
    void meExigeToken() throws Exception {
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", "Bearer token-falso")).andExpect(status().isUnauthorized());
        String token = registerUser();
        mvc.perform(get("/api/me").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").isNotEmpty())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void limiteDeIntentosPorIp() throws Exception {
        String sameIp = uniqueIp();
        var body = json.writeValueAsString(Map.of("email", "nadie@example.com", "password", "da-igual-1234"));
        // El perfil de test permite 5 intentos por minuto.
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login").with(ip(sameIp)).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").with(ip(sameIp)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
        // Otra IP no se ve afectada.
        mvc.perform(post("/api/auth/login").with(ip(uniqueIp())).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
    }
}
