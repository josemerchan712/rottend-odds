package dev.casino.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class JwtSecretStartupTest {

    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    static class PropsOnly {}

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ConfigurationPropertiesAutoConfiguration.class))
            .withUserConfiguration(PropsOnly.class);

    @Test
    void noArrancaSinJwtSecret() {
        runner.run(ctx -> {
            assertThat(ctx).hasFailed();
            assertThat(ctx.getStartupFailure()).rootCause().hasMessageContaining("JWT_SECRET");
        });
    }

    @Test
    void noArrancaConUnSecretoCorto() {
        runner.withPropertyValues("app.jwt.secret=demasiado-corto").run(ctx -> {
            assertThat(ctx).hasFailed();
            assertThat(ctx.getStartupFailure()).rootCause().hasMessageContaining("32");
        });
    }

    @Test
    void arrancaConUnSecretoDe32CaracteresOMas() {
        runner.withPropertyValues("app.jwt.secret=" + "x".repeat(32)).run(ctx -> assertThat(ctx).hasNotFailed());
    }

    @Test
    void elSecretoNoApareceEnToString() {
        var jwt = new AppProperties.Jwt("s".repeat(40), Duration.ofHours(24), "test");
        assertThat(jwt.toString()).doesNotContain("ssss");
        assertThatThrownBy(() -> new AppProperties.Jwt(" ", null, null)).isInstanceOf(IllegalStateException.class);
    }
}
