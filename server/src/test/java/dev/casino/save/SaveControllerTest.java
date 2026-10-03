package dev.casino.save;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.casino.ApiTestSupport;
import dev.casino.SaveFixtures;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class SaveControllerTest extends ApiTestSupport {

    private ResultActions putSave(String token, Long baseRevision, Object data) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("baseRevision", baseRevision);
        body.put("data", data);
        return mvc.perform(put("/api/save").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    @Test
    void sinTokenNoHayGuardado() throws Exception {
        mvc.perform(get("/api/save")).andExpect(status().isUnauthorized());
    }

    @Test
    void guardarYLeer() throws Exception {
        String token = registerUser();
        mvc.perform(get("/api/save").header("Authorization", bearer(token))).andExpect(status().isNotFound());

        putSave(token, null, SaveFixtures.save(1234, 300))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.verified").value(true))
                .andExpect(jsonPath("$.saveVersion").value(3));

        mvc.perform(get("/api/save").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.balance").value(1234))
                .andExpect(jsonPath("$.data.state.playTime").value(300));
    }

    @Test
    void conflictoDeVersionesYDecisionDelCliente() throws Exception {
        String token = registerUser();
        putSave(token, null, SaveFixtures.save(100, 60)).andExpect(jsonPath("$.revision").value(1));
        // Otro dispositivo guarda encima (revisión 1 → 2).
        putSave(token, 1L, SaveFixtures.save(900, 200)).andExpect(jsonPath("$.revision").value(2));

        // El primer dispositivo sigue creyendo que la última es la 1: conflicto, con el guardado del servidor.
        putSave(token, 1L, SaveFixtures.save(150, 90))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.server.revision").value(2))
                .andExpect(jsonPath("$.server.balance").value(900));
        // Sin revisión base tampoco puede pisar un guardado existente.
        putSave(token, null, SaveFixtures.save(150, 90)).andExpect(status().isConflict());

        // El jugador decide sobrescribir: reenvía con la revisión del servidor.
        putSave(token, 2L, SaveFixtures.save(150, 90))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(3))
                .andExpect(jsonPath("$.balance").value(150));
    }

    @Test
    void guardadosImposiblesDan422() throws Exception {
        String token = registerUser();

        Map<String, Object> ups = SaveFixtures.upgrades();
        ups.put("luck", 21);
        putSave(token, null, SaveFixtures.save(10, 60, ups, false))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("upgrades.luck"))));

        putSave(token, null, SaveFixtures.save(-5, 60)).andExpect(status().isUnprocessableEntity());

        Map<String, Object> wrongVersion = SaveFixtures.save(10, 60);
        wrongVersion.put("version", 99);
        putSave(token, null, wrongVersion)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("version"))));

        Map<String, Object> noCrupier = SaveFixtures.upgrades();
        noCrupier.put("helperSpeed", 3);
        putSave(token, null, SaveFixtures.save(10, 600, noCrupier, false))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("requiere el Crupier"))));

        Map<String, Object> unknown = SaveFixtures.upgrades();
        unknown.put("trampa", 1);
        putSave(token, null, SaveFixtures.save(10, 60, unknown, false)).andExpect(status().isUnprocessableEntity());

        Map<String, Object> profile = SaveFixtures.save(10, 60);
        @SuppressWarnings("unchecked")
        Map<String, Object> state = (Map<String, Object>) profile.get("state");
        state.put("helper", Map.of("timer", 0, "lockout", 0, "profile", 2));
        putSave(token, null, profile)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("helper.profile"))));

        putSave(token, null, Map.of("version", 3)).andExpect(status().isUnprocessableEntity());
        // Nada de lo anterior se ha guardado.
        mvc.perform(get("/api/save").header("Authorization", bearer(token))).andExpect(status().isNotFound());
    }

    @Test
    void guardadoImplausibleSeAceptaComoNoVerificado() throws Exception {
        String token = registerUser();
        // Mil millones de fichas al minuto de juego: posible en teoría, estadísticamente absurdo.
        putSave(token, null, SaveFixtures.save(1e9, 60))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verified").value(false))
                .andExpect(jsonPath("$.verificationNote", containsString("máximo plausible")));
        // Si después sube un guardado normal, vuelve a estar verificado.
        putSave(token, 1L, SaveFixtures.save(500, 120))
                .andExpect(jsonPath("$.verified").value(true))
                .andExpect(jsonPath("$.verificationNote").doesNotExist());
    }

    @Test
    void laBasuraDelPrimerSegundoNoEsSospechosa() throws Exception {
        String token = registerUser();
        // Un dedo con anillo (500) en el primer segundo: lo cubre el límite físico de la basura.
        putSave(token, null, SaveFixtures.save(500, 1)).andExpect(jsonPath("$.verified").value(true));
    }
}
