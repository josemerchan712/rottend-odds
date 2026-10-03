package dev.casino.auth;

import dev.casino.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Cuentas")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/api/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Crear cuenta", description = "Contraseña de 10+ caracteres. Nombre público de 3-20 caracteres, "
            + "único y sin formato de email. Limitado a unos pocos intentos por IP y minuto.")
    public AuthDtos.TokenResponse register(@Valid @RequestBody AuthDtos.RegisterRequest req) {
        return auth.register(req);
    }

    @PostMapping("/api/auth/login")
    @Operation(summary = "Iniciar sesión", description = "Devuelve un JWT válido 24 h. Limitado por IP.")
    public AuthDtos.TokenResponse login(@Valid @RequestBody AuthDtos.LoginRequest req) {
        return auth.login(req);
    }

    @GetMapping("/api/me")
    @Operation(summary = "Usuario actual", security = @SecurityRequirement(name = OpenApiConfig.BEARER))
    public AuthDtos.MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        User user = auth.get(JwtService.userId(jwt));
        return new AuthDtos.MeResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getCreatedAt());
    }
}
