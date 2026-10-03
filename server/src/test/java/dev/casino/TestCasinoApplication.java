package dev.casino;

import org.springframework.boot.SpringApplication;

/**
 * Arranque de desarrollo sin Docker ni Postgres: base de datos H2 en memoria (se borra al parar)
 * y la configuración del perfil de test.
 *
 *   cd server && ./mvnw spring-boot:test-run -Dspring-boot.run.profiles=test
 */
public class TestCasinoApplication {

    public static void main(String[] args) {
        SpringApplication.from(CasinoApplication::main).run(args);
    }
}
