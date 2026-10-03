package dev.casino.save;

import dev.casino.auth.JwtService;
import dev.casino.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Guardado en la nube")
@SecurityRequirement(name = OpenApiConfig.BEARER)
public class SaveController {

    private final SaveService saves;

    public SaveController(SaveService saves) {
        this.saves = saves;
    }

    @GetMapping("/api/save")
    @Operation(summary = "Leer el guardado de la nube")
    @ApiResponse(responseCode = "404", description = "No hay partida guardada")
    public SaveDtos.SaveResponse get(@AuthenticationPrincipal Jwt jwt) {
        return saves.get(JwtService.userId(jwt));
    }

    @PutMapping("/api/save")
    @Operation(summary = "Escribir el guardado de la nube",
            description = "Control de conflictos por revisión. 422 si el guardado es imposible; si es posible pero "
                    + "implausible, se acepta con verified=false.")
    @ApiResponse(responseCode = "409", description = "El servidor tiene un guardado más reciente (va en `server`)")
    @ApiResponse(responseCode = "422", description = "Guardado imposible según los números del juego")
    public SaveDtos.SaveResponse put(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SaveDtos.SaveRequest req) {
        return saves.put(JwtService.userId(jwt), req.baseRevision(), req.data());
    }

    @ExceptionHandler(SaveConflictException.class)
    ResponseEntity<SaveDtos.ConflictResponse> conflict(SaveConflictException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new SaveDtos.ConflictResponse(
                HttpStatus.CONFLICT.value(), HttpStatus.CONFLICT.getReasonPhrase(), ex.getMessage(), ex.server()));
    }
}
