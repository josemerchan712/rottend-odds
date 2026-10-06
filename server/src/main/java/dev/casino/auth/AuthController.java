package dev.casino.auth;

import dev.casino.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Cuentas", description = "Cuentas sin email: nombre de jugador + contraseña, con código de recuperación.")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/api/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Crear cuenta", description = "Nombre de jugador de 3-20 caracteres (letras ASCII, dígitos, '-' y '_', "
            + "sin empezar ni acabar con símbolo), único sin distinguir mayúsculas, ni reservado ni ofensivo. Contraseña de "
            + "10+ caracteres, distinta del nombre. Devuelve el código de recuperación UNA sola vez. Si el nombre está "
            + "ocupado: 409 con hasta 5 sugerencias libres en `suggestions`. Limitado por IP.")
    public AuthDtos.TokenResponse register(@Valid @RequestBody AuthDtos.RegisterRequest req) {
        return auth.register(req);
    }

    @PostMapping("/api/auth/login")
    @Operation(summary = "Iniciar sesión", description = "Devuelve un JWT válido 24 h. Error genérico (no dice si el nombre existe). Limitado por IP.")
    public AuthDtos.TokenResponse login(@Valid @RequestBody AuthDtos.LoginRequest req) {
        return auth.login(req);
    }

    @GetMapping("/api/auth/name-available")
    @Operation(summary = "¿Nombre disponible?", description = "Para el aviso mientras se escribe. Si está ocupado, sugerencias "
            + "libres. Con su propio límite de intentos por IP, para que no sirva para listar usuarios.")
    public AuthDtos.NameCheckResponse nameAvailable(@RequestParam("name") String name) {
        return auth.checkName(name);
    }

    @PostMapping("/api/auth/reset")
    @Operation(summary = "Restablecer la contraseña", description = "Con el nombre y el código de recuperación. Invalida el código "
            + "usado y devuelve uno nuevo (una sola vez) y la sesión iniciada. Error genérico. Limitado por IP.")
    public AuthDtos.TokenResponse reset(@Valid @RequestBody AuthDtos.ResetRequest req) {
        return auth.resetPassword(req);
    }

    @GetMapping("/api/me")
    @Operation(summary = "Usuario actual", security = @SecurityRequirement(name = OpenApiConfig.BEARER))
    public AuthDtos.MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        User user = auth.get(JwtService.userId(jwt));
        return new AuthDtos.MeResponse(user.getId(), user.getPlayerName(), user.getCreatedAt());
    }

    @DeleteMapping("/api/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Borrar la cuenta", description = "Borra la cuenta y todos sus datos (guardado en la nube y ranking). No se puede deshacer.",
            security = @SecurityRequirement(name = OpenApiConfig.BEARER))
    public void delete(@AuthenticationPrincipal Jwt jwt) {
        auth.deleteAccount(JwtService.userId(jwt));
    }

    @GetMapping("/api/me/export")
    @Operation(summary = "Exportar mis datos", description = "Todos los datos de la cuenta en JSON (sin hashes).",
            security = @SecurityRequirement(name = OpenApiConfig.BEARER))
    public ResponseEntity<Map<String, Object>> export(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"rotten-odds-mis-datos.json\"")
                .body(auth.export(JwtService.userId(jwt)));
    }
}
