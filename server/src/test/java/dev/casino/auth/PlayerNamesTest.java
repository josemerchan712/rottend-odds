package dev.casino.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Random;
import org.junit.jupiter.api.Test;

class PlayerNamesTest {

    @Test
    void formato() {
        for (String ok : java.util.List.of("Pepe", "abc", "a_b", "Mano-Negra", "x1y2z3", "A".repeat(20))) {
            assertThat(PlayerNames.problem(ok)).as(ok).isEmpty();
        }
        for (String bad : java.util.List.of("ab", "A".repeat(21), "-pepe", "pepe_", "pe pe", "peña", "a.b", "", "  ")) {
            assertThat(PlayerNames.problem(bad)).as(bad).contains(PlayerNames.Problem.FORMATO);
        }
    }

    @Test
    void reservadosConSeparadoresMayusculasYNumeros() {
        for (String name : java.util.List.of("ADMIN", "Admin_1", "mod99", "Dueno", "dueño2".replace("ñ", "n"), "Rotten-Odds", "la_casa", "Diablillo")) {
            assertThat(PlayerNames.problem(name)).as(name).contains(PlayerNames.Problem.RESERVADO);
        }
        assertThat(PlayerNames.problem("Administra_Bien")).isEmpty();
    }

    @Test
    void ofensivosConLeetYSinFalsosPositivosComunes() {
        for (String name : java.util.List.of("Mierda", "sh1t", "F_U_C_K", "putamadre", "hijo-puta", "n4z1")) {
            assertThat(PlayerNames.problem(name)).as(name).contains(PlayerNames.Problem.NO_PERMITIDO);
        }
        // Palabras normales que contienen una raíz en medio (límite conocido del filtro: aquí no saltan).
        for (String name : java.util.List.of("Computadora", "Reputacion", "Assassin", "Grapefruit")) {
            assertThat(PlayerNames.problem(name)).as(name).isEmpty();
        }
    }

    @Test
    void sugerenciasValidasYQueCaben() {
        var candidates = PlayerNames.candidates("NombreMuyLargoDeVeras", new Random(1));
        assertThat(candidates).isNotEmpty();
        for (String c : candidates) {
            assertThat(c.length()).as(c).isBetween(PlayerNames.MIN_LENGTH, PlayerNames.MAX_LENGTH);
            assertThat(PlayerNames.isAcceptable(c)).as(c).isTrue();
        }
        assertThat(candidates.subList(0, 5)).anyMatch(c -> c.endsWith("_Deuda")).anyMatch(c -> c.matches(".*\\d+$"));
    }

    @Test
    void codigosDeRecuperacion() {
        String code = RecoveryCodes.generate();
        assertThat(code).matches("^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$");
        assertThat(RecoveryCodes.normalize(" abcd-efgh ")).isEqualTo("ABCDEFGH");
        assertThat(RecoveryCodes.generate()).isNotEqualTo(code);
    }
}
