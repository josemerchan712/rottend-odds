package dev.casino.ranking;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import dev.casino.ApiTestSupport;
import dev.casino.SaveFixtures;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.ResultActions;

/** Contexto propio para que el ranking empiece vacío. */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class RankingControllerTest extends ApiTestSupport {

    private ResultActions debtPaid(String token, Object data) throws Exception {
        return mvc.perform(post("/api/debt-paid").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("data", data))));
    }

    private JsonNode rankingPage(int page, int size) throws Exception {
        String body = mvc.perform(get("/api/ranking").param("page", "" + page).param("size", "" + size))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return readJson(body);
    }

    @Test
    void rankingCompleto() throws Exception {
        String lento = registerUser();
        String rapido = registerUser();
        String tramposo = registerUser();

        debtPaid(lento, SaveFixtures.finished(600))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.verified").value(true))
                .andExpect(jsonPath("$.rank").value(1));
        debtPaid(rapido, SaveFixtures.finished(420))
                .andExpect(jsonPath("$.rank").value(1));
        // 10 segundos: implausible (por fichas y por tiempo). Se guarda, pero no entra en el ranking.
        debtPaid(tramposo, SaveFixtures.finished(10))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.verified").value(false))
                .andExpect(jsonPath("$.rank").doesNotExist())
                .andExpect(jsonPath("$.verificationNote", containsString("plausible")));

        JsonNode page = rankingPage(0, 10);
        org.assertj.core.api.Assertions.assertThat(page.get("totalElements").asLong()).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(page.get("content").get(0).get("playTimeSeconds").asDouble()).isEqualTo(420);
        org.assertj.core.api.Assertions.assertThat(page.get("content").get(0).get("rank").asLong()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(page.get("content").get(1).get("rank").asLong()).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(page.toString()).doesNotContain("@example.com");

        // Paginación: la segunda página de tamaño 1 es el segundo puesto.
        JsonNode second = rankingPage(1, 1);
        org.assertj.core.api.Assertions.assertThat(second.get("content").get(0).get("rank").asLong()).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(second.get("totalPages").asInt()).isEqualTo(2);

        // Un resultado peor no sustituye al mejor; uno mejor sí.
        debtPaid(lento, SaveFixtures.finished(700)).andExpect(jsonPath("$.newBest").value(false));
        debtPaid(lento, SaveFixtures.finished(400))
                .andExpect(jsonPath("$.newBest").value(true))
                .andExpect(jsonPath("$.rank").value(1));
    }

    @Test
    void validacionDeDebtPaid() throws Exception {
        String token = registerUser();
        mvc.perform(post("/api/debt-paid").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("data", SaveFixtures.finished(500)))))
                .andExpect(status().isUnauthorized());
        // Sin la deuda pagada.
        debtPaid(token, SaveFixtures.save(1000, 500))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0]", containsString("debtPaid")));
        // Imposible: nivel fuera de rango.
        Map<String, Object> ups = SaveFixtures.upgrades();
        ups.put("maxBet", 50);
        debtPaid(token, SaveFixtures.save(1000, 500, ups, true)).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void parametrosDePaginacion() throws Exception {
        mvc.perform(get("/api/ranking")).andExpect(status().isOk()).andExpect(jsonPath("$.size").value(20));
        mvc.perform(get("/api/ranking").param("size", "500")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/ranking").param("page", "-1")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/ranking").param("page", "abc")).andExpect(status().isBadRequest());
    }

    @Test
    void openApiDocumentaLosEndpoints() throws Exception {
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/save'].put").exists())
                .andExpect(jsonPath("$.paths['/api/ranking'].get").exists())
                .andExpect(jsonPath("$.paths['/api/debt-paid'].post").exists())
                .andExpect(jsonPath("$.paths['/api/auth/login'].post").exists());
    }
}
