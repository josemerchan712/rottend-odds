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
                .andExpect(jsonPath("$.saveVersion").value(7));

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
    @SuppressWarnings("unchecked")
    void mesa2ValidacionEstructural() throws Exception {
        String token = registerUser();
        // Mesa 1 saldada y mesa 2 en marcha: se acepta.
        Map<String, Object> ok = SaveFixtures.finished(8 * 60 + 30);
        Map<String, Object> state = (Map<String, Object>) ok.get("state");
        Map<String, Object> slotUps = SaveFixtures.slotUpgrades();
        slotUps.put("luck", 7);
        slotUps.put("zombie", 1);
        slotUps.put("hold", 2);
        state.put("slots", SaveFixtures.slots(12_345, 200, slotUps, false));
        state.put("activeTable", 2);
        putSave(token, null, ok).andExpect(status().isOk());

        // Nivel fuera de rango en la mesa 2.
        Map<String, Object> badLevel = SaveFixtures.finished(8 * 60 + 30);
        Map<String, Object> ups = SaveFixtures.slotUpgrades();
        ups.put("hold", 9);
        ((Map<String, Object>) badLevel.get("state")).put("slots", SaveFixtures.slots(10, 10, ups, false));
        putSave(token, 1L, badLevel)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("slots.upgrades.hold"))));

        // Mejoras del zombi sin el zombi.
        Map<String, Object> noZombie = SaveFixtures.finished(8 * 60 + 30);
        Map<String, Object> ups2 = SaveFixtures.slotUpgrades();
        ups2.put("helperSpeed", 2);
        ((Map<String, Object>) noZombie.get("state")).put("slots", SaveFixtures.slots(10, 10, ups2, false));
        putSave(token, 1L, noZombie)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("requiere el empleado zombi"))));

        // Progreso en la mesa 2 sin haber pagado la mesa 1, o la mesa 2 activa sin pagarla.
        Map<String, Object> early = SaveFixtures.save(100, 120);
        ((Map<String, Object>) early.get("state")).put("slots", SaveFixtures.slots(500, 30, SaveFixtures.slotUpgrades(), false));
        putSave(token, 1L, early)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("sin la deuda de la mesa 1"))));
        Map<String, Object> activeEarly = SaveFixtures.save(100, 120);
        ((Map<String, Object>) activeEarly.get("state")).put("activeTable", 2);
        putSave(token, 1L, activeEarly)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("activeTable"))));

        // Un guardado v5 sin la mesa 2: estructura incompleta.
        Map<String, Object> missing = SaveFixtures.save(100, 120);
        ((Map<String, Object>) missing.get("state")).remove("slots");
        putSave(token, 1L, missing).andExpect(status().isUnprocessableEntity());
    }

    @Test
    @SuppressWarnings("unchecked")
    void mesa3ValidacionEstructural() throws Exception {
        String token = registerUser();
        // Mesas 1 y 2 saldadas y mesa 3 en marcha: se acepta.
        Map<String, Object> ok = SaveFixtures.finished(8 * 60 + 30);
        Map<String, Object> state = (Map<String, Object>) ok.get("state");
        state.put("slots", SaveFixtures.slots(500, 700, SaveFixtures.slotUpgrades(), true));
        Map<String, Object> diceUps = SaveFixtures.diceUpgrades();
        diceUps.put("luck", 5);
        diceUps.put("ghost", 1);
        diceUps.put("hardTargets", 1);
        state.put("dice", SaveFixtures.dice(4_000, 120, diceUps, false));
        state.put("activeTable", 3);
        putSave(token, null, ok).andExpect(status().isOk());

        // Progreso en la mesa 3 sin haber pagado la mesa 2.
        Map<String, Object> early = SaveFixtures.finished(8 * 60 + 30);
        ((Map<String, Object>) early.get("state")).put("dice", SaveFixtures.dice(100, 10, SaveFixtures.diceUpgrades(), false));
        putSave(token, 1L, early)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("sin la deuda de la mesa 2"))));

        // Nivel fuera de rango y mejoras del camarero sin el camarero.
        Map<String, Object> bad = SaveFixtures.finished(8 * 60 + 30);
        Map<String, Object> badState = (Map<String, Object>) bad.get("state");
        badState.put("slots", SaveFixtures.slots(0, 700, SaveFixtures.slotUpgrades(), true));
        Map<String, Object> badUps = SaveFixtures.diceUpgrades();
        badUps.put("boxcars", 4);
        badUps.put("helperLuck", 1);
        badState.put("dice", SaveFixtures.dice(10, 10, badUps, false));
        putSave(token, 1L, bad)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("dice.upgrades.boxcars"))))
                .andExpect(jsonPath("$.details", hasItem(containsString("requiere el camarero fantasma"))));

        // La mesa 3 activa sin pagar la 2.
        Map<String, Object> active = SaveFixtures.finished(8 * 60 + 30);
        ((Map<String, Object>) active.get("state")).put("activeTable", 3);
        putSave(token, 1L, active)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("activeTable"))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void mesa4ValidacionEstructural() throws Exception {
        String token = registerUser();
        // Mesas 1 a 3 saldadas y mesa 4 en marcha: se acepta.
        Map<String, Object> ok = SaveFixtures.finished(8 * 60 + 30);
        Map<String, Object> state = (Map<String, Object>) ok.get("state");
        state.put("slots", SaveFixtures.slots(500, 700, SaveFixtures.slotUpgrades(), true));
        state.put("dice", SaveFixtures.dice(800, 840, SaveFixtures.diceUpgrades(), true));
        Map<String, Object> cardsUps = SaveFixtures.cardsUpgrades();
        cardsUps.put("luck", 6);
        cardsUps.put("skeleton", 1);
        state.put("cards", SaveFixtures.cards(5_000, 90, cardsUps, false));
        state.put("activeTable", 4);
        putSave(token, null, ok).andExpect(status().isOk());

        // Progreso en la mesa 4 sin haber pagado la mesa 3.
        Map<String, Object> early = SaveFixtures.finished(8 * 60 + 30);
        Map<String, Object> earlyState = (Map<String, Object>) early.get("state");
        earlyState.put("slots", SaveFixtures.slots(0, 700, SaveFixtures.slotUpgrades(), true));
        earlyState.put("cards", SaveFixtures.cards(100, 10, SaveFixtures.cardsUpgrades(), false));
        putSave(token, 1L, early)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("sin la deuda de la mesa 3"))));

        // Nivel fuera de rango y mejoras del esqueleto sin el esqueleto.
        Map<String, Object> bad = SaveFixtures.finished(8 * 60 + 30);
        Map<String, Object> badState = (Map<String, Object>) bad.get("state");
        badState.put("slots", SaveFixtures.slots(0, 700, SaveFixtures.slotUpgrades(), true));
        badState.put("dice", SaveFixtures.dice(0, 840, SaveFixtures.diceUpgrades(), true));
        Map<String, Object> badUps = SaveFixtures.cardsUpgrades();
        badUps.put("maxBet", 99);
        badUps.put("helperSpeed", 1);
        badState.put("cards", SaveFixtures.cards(10, 10, badUps, false));
        putSave(token, 1L, bad)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("cards.upgrades.maxBet"))))
                .andExpect(jsonPath("$.details", hasItem(containsString("requiere el esqueleto barajador"))));

        // La mesa 4 activa sin pagar la 3.
        Map<String, Object> active = SaveFixtures.finished(8 * 60 + 30);
        ((Map<String, Object>) active.get("state")).put("activeTable", 4);
        putSave(token, 1L, active)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details", hasItem(containsString("activeTable"))));
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
