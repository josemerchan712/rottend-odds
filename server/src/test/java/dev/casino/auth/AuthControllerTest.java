package dev.casino.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import dev.casino.ApiTestSupport;
import dev.casino.SaveFixtures;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

class AuthControllerTest extends ApiTestSupport {

    @Autowired
    private UserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    private int login(String name, String password) throws Exception {
        return mvc.perform(jsonPost("/api/auth/login", Map.of("playerName", name, "password", password)))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void registroDevuelveTokenYCodigoDeRecuperacionUnaVez() throws Exception {
        String name = unique("Ana");
        mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", name, "password", PASSWORD)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.playerName").value(name))
                .andExpect(jsonPath("$.recoveryCode", matchesPattern("^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$")))
                .andExpect(jsonPath("$.password").doesNotExist());
        // El login no vuelve a enseñar el código: solo queda su hash.
        mvc.perform(jsonPost("/api/auth/login", Map.of("playerName", name, "password", PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recoveryCode").doesNotExist());
        User user = users.findByPlayerNameKey(PlayerNames.key(name)).orElseThrow();
        assertThat(user.getRecoveryCodeHash()).startsWith("$2");
        assertThat(user.getPasswordHash()).startsWith("$2");
    }

    @Test
    void nombreUnicoSinDistinguirMayusculasYSeMuestraComoSeEscribio() throws Exception {
        String name = unique("Pepe");
        register(name);
        // Mismo nombre en minúsculas: ocupado, con sugerencias libres y válidas.
        String body = mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", name.toLowerCase(), "password", PASSWORD)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Ese nombre ya está en uso"))
                .andReturn().getResponse().getContentAsString();
        JsonNode suggestions = readJson(body).get("suggestions");
        assertThat(suggestions.size()).isBetween(1, 5);
        for (JsonNode s : suggestions) {
            assertThat(PlayerNames.isAcceptable(s.asText())).as(s.asText()).isTrue();
            assertThat(users.existsByPlayerNameKey(PlayerNames.key(s.asText()))).as(s.asText()).isFalse();
        }
        // Una sugerencia se puede registrar de verdad.
        register(suggestions.get(0).asText());
        // Login con otras mayúsculas: entra y el nombre sale como se registró.
        mvc.perform(jsonPost("/api/auth/login", Map.of("playerName", name.toUpperCase(), "password", PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playerName").value(name));
    }

    @Test
    void dosRegistrosSimultaneosConElMismoNombre() throws Exception {
        String name = unique("Gemelo");
        int threads = 6;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            Callable<Integer> attempt = () -> {
                start.await();
                return mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", name, "password", PASSWORD)))
                        .andReturn().getResponse().getStatus();
            };
            results.add(pool.submit(attempt));
        }
        start.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : results) statuses.add(f.get());
        pool.shutdown();
        // Exactamente uno crea la cuenta; los demás reciben 409 (nunca 500).
        assertThat(statuses).containsOnly(201, 409);
        assertThat(statuses.stream().filter(s -> s == 201).count()).isEqualTo(1);
    }

    @Test
    void nombresInvalidosReservadosYOfensivosDan400() throws Exception {
        for (String bad : List.of("ab", "a".repeat(21), "_pepe", "pepe-", "pe pe", "peñón", "yo@mail.com", "José")) {
            mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", bad, "password", PASSWORD)))
                    .andExpect(status().isBadRequest());
        }
        for (String reserved : List.of("Admin", "admin1", "Encargado", "crupier", "Dueno", "ROTTEN_ODDS", "claude", "Anthropic")) {
            mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", reserved, "password", PASSWORD)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.details", hasItem(containsString("reservado"))));
        }
        for (String offensive : List.of("MierdaSeca", "fuck_you", "sh1t99", "putamadre")) {
            mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", offensive, "password", PASSWORD)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.details", hasItem(containsString("no está permitido"))));
        }
    }

    @Test
    void contrasenaCortaOIgualAlNombreDan400() throws Exception {
        mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", unique("Luz"), "password", "corta123")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details", hasItem(containsString("password"))));
        String name = "Nombrelargo" + (System.nanoTime() % 1000);
        mvc.perform(jsonPost("/api/auth/register", Map.of("playerName", name, "password", name.toLowerCase())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details", hasItem(containsString("igual que el nombre"))));
    }

    @Test
    void loginConErrorGenericoSinDecirSiElNombreExiste() throws Exception {
        String name = unique("Eva");
        register(name);
        mvc.perform(jsonPost("/api/auth/login", Map.of("playerName", name, "password", "otra-contraseña")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value(AuthService.LOGIN_ERROR))
                .andExpect(jsonPath("$.message", not(containsString("otra-contraseña"))));
        mvc.perform(jsonPost("/api/auth/login", Map.of("playerName", unique("Nadie"), "password", "otra-contraseña")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value(AuthService.LOGIN_ERROR));
    }

    @Test
    void restablecerConCodigoDeUnSoloUso() throws Exception {
        String name = unique("Olvido");
        String code = register(name).get("recoveryCode").asText();
        // Código equivocado o nombre inexistente: el mismo error genérico.
        mvc.perform(jsonPost("/api/auth/reset", Map.of("playerName", name, "recoveryCode", "AAAA-BBBB-CCCC-DDDD", "newPassword", "nueva-contraseña")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value(AuthService.RESET_ERROR));
        mvc.perform(jsonPost("/api/auth/reset", Map.of("playerName", unique("Nadie"), "recoveryCode", code, "newPassword", "nueva-contraseña")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value(AuthService.RESET_ERROR));
        // Con el código bueno (sin guiones y en minúsculas también vale): sesión y código nuevo.
        String body = mvc.perform(jsonPost("/api/auth/reset", Map.of("playerName", name, "recoveryCode", code.replace("-", "").toLowerCase(), "newPassword", "nueva-contraseña")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String newCode = readJson(body).get("recoveryCode").asText();
        assertThat(newCode).isNotEqualTo(code);
        assertThat(login(name, PASSWORD)).isEqualTo(401);
        assertThat(login(name, "nueva-contraseña")).isEqualTo(200);
        // El código usado ya no vale; el nuevo sí.
        mvc.perform(jsonPost("/api/auth/reset", Map.of("playerName", name, "recoveryCode", code, "newPassword", "otra-contraseña-mas")))
                .andExpect(status().isUnauthorized());
        mvc.perform(jsonPost("/api/auth/reset", Map.of("playerName", name, "recoveryCode", newCode, "newPassword", "otra-contraseña-mas")))
                .andExpect(status().isOk());
    }

    @Test
    void disponibilidadDelNombre() throws Exception {
        String name = unique("Libre");
        mvc.perform(get("/api/auth/name-available").param("name", name).with(ip(uniqueIp())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true));
        register(name);
        mvc.perform(get("/api/auth/name-available").param("name", name.toUpperCase()).with(ip(uniqueIp())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.reason").value("ocupado"))
                .andExpect(jsonPath("$.suggestions[0]").isNotEmpty());
        mvc.perform(get("/api/auth/name-available").param("name", "Barman").with(ip(uniqueIp())))
                .andExpect(jsonPath("$.reason").value("reservado"));
        mvc.perform(get("/api/auth/name-available").param("name", "x").with(ip(uniqueIp())))
                .andExpect(jsonPath("$.reason").value("formato"));
    }

    @Test
    void limitesDeIntentosPorIp() throws Exception {
        // Login, registro y restablecer comparten el cubo de credenciales (5 por minuto en el perfil de test).
        String sameIp = uniqueIp();
        var loginBody = json.writeValueAsString(Map.of("playerName", "Nadie123", "password", "da-igual-1234"));
        for (int i = 0; i < 4; i++) {
            mvc.perform(post("/api/auth/login").with(ip(sameIp)).contentType(MediaType.APPLICATION_JSON).content(loginBody))
                    .andExpect(status().isUnauthorized());
        }
        var resetBody = json.writeValueAsString(Map.of("playerName", "Nadie123", "recoveryCode", "AAAA", "newPassword", "da-igual-1234"));
        mvc.perform(post("/api/auth/reset").with(ip(sameIp)).contentType(MediaType.APPLICATION_JSON).content(resetBody))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/reset").with(ip(sameIp)).contentType(MediaType.APPLICATION_JSON).content(resetBody))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
        // Otra IP no se ve afectada.
        mvc.perform(post("/api/auth/login").with(ip(uniqueIp())).contentType(MediaType.APPLICATION_JSON).content(loginBody))
                .andExpect(status().isUnauthorized());
        // La consulta de nombres tiene su propio cubo (8 por minuto en test).
        String checkIp = uniqueIp();
        for (int i = 0; i < 8; i++) {
            mvc.perform(get("/api/auth/name-available").param("name", "Nombre" + i).with(ip(checkIp))).andExpect(status().isOk());
        }
        mvc.perform(get("/api/auth/name-available").param("name", "Nombre9").with(ip(checkIp)))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void meBorrarYExportar() throws Exception {
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", "Bearer token-falso")).andExpect(status().isUnauthorized());
        String name = unique("Borrable");
        String token = register(name).get("token").asText();
        mvc.perform(get("/api/me").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playerName").value(name))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        // Con un guardado en la nube, que también se exporta y se borra.
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/save")
                        .header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("data", SaveFixtures.save(500, 120)))))
                .andExpect(status().isOk());
        mvc.perform(get("/api/me/export").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("attachment")))
                .andExpect(jsonPath("$.playerName").value(name))
                .andExpect(jsonPath("$.cloudSave.revision").value(1))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.recoveryCodeHash").doesNotExist());
        mvc.perform(delete("/api/me")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/me").header("Authorization", bearer(token))).andExpect(status().isNoContent());
        assertThat(users.existsByPlayerNameKey(PlayerNames.key(name))).isFalse();
        assertThat(login(name, PASSWORD)).isEqualTo(401);
        assertThat(jdbc.queryForObject("select count(*) from cloud_saves s join users u on u.id = s.user_id where u.player_name_key = ?",
                Integer.class, PlayerNames.key(name))).isZero();
        // El nombre queda libre otra vez.
        register(name);
    }

    @Test
    void migracionSinEmailYConRestriccionUnicaSobreElNombreNormalizado() {
        assertThat(jdbc.queryForObject("select count(*) from \"flyway_schema_history\" where \"version\" = '1' and \"success\" = true", Integer.class))
                .isEqualTo(1);
        List<String> columns = jdbc.queryForList(
                "select lower(column_name) from information_schema.columns where lower(table_name) = 'users'", String.class);
        assertThat(columns).contains("player_name", "player_name_key", "password_hash", "recovery_code_hash").doesNotContain("email");
        Integer unique = jdbc.queryForObject("""
                select count(*) from information_schema.table_constraints
                where lower(table_name) = 'users' and constraint_type = 'UNIQUE' and lower(constraint_name) = 'uq_users_player_name_key'
                """, Integer.class);
        assertThat(unique).isEqualTo(1);
    }
}
