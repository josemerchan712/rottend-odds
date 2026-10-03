package dev.casino.ranking;

import dev.casino.auth.JwtService;
import dev.casino.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Ranking")
public class RankingController {

    private final RankingService ranking;

    public RankingController(RankingService ranking) {
        this.ranking = ranking;
    }

    @GetMapping("/api/ranking")
    @Operation(summary = "Ranking de la mesa 1",
            description = "Quién saldó antes la deuda (tiempo de juego). Público, paginado, solo resultados verificados.")
    public RankingDtos.Page ranking(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ranking.ranking(page, size);
    }

    @PostMapping("/api/debt-paid")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Registrar la deuda saldada", security = @SecurityRequirement(name = OpenApiConfig.BEARER),
            description = "Se envía la partida en el momento de pagar. Se guarda el mejor resultado de cada usuario.")
    @ApiResponse(responseCode = "422", description = "Partida imposible o sin la deuda saldada")
    public RankingDtos.DebtPaidResponse debtPaid(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody RankingDtos.DebtPaidRequest req) {
        return ranking.recordDebtPaid(JwtService.userId(jwt), req.data());
    }
}
