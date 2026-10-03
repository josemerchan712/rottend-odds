package dev.casino.ranking;

import com.fasterxml.jackson.databind.JsonNode;
import dev.casino.common.ApiException;
import dev.casino.validation.SaveValidator;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RankingService {

    public static final int MAX_PAGE_SIZE = 100;

    private final DebtResultRepository results;
    private final SaveValidator validator;

    public RankingService(DebtResultRepository results, SaveValidator validator) {
        this.results = results;
        this.validator = validator;
    }

    /**
     * Registra que el usuario ha saldado la deuda. Se valida la partida enviada con las mismas dos
     * capas que el guardado: imposible → 422; implausible → se guarda sin verificar.
     */
    @Transactional
    public RankingDtos.DebtPaidResponse recordDebtPaid(UUID userId, JsonNode data) {
        SaveValidator.Result result = validator.validate(data);
        if (!result.snapshot().debtPaid()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Guardado imposible",
                    List.of("debtPaid: la partida no tiene la deuda saldada"));
        }
        DebtResult candidate = new DebtResult(userId, result.snapshot().playTime(), result.verified());
        DebtResult current = results.findById(userId).orElse(null);
        boolean newBest = current == null || candidate.isBetterThan(current);
        if (newBest) {
            if (current != null) {
                results.delete(current);
                results.flush();
            }
            results.saveAndFlush(candidate);
        }
        DebtResult best = newBest ? candidate : current;
        Long rank = best.isVerified() ? results.countByVerifiedTrueAndPlayTimeSecondsLessThan(best.getPlayTimeSeconds()) + 1 : null;
        return new RankingDtos.DebtPaidResponse(candidate.getPlayTimeSeconds(), candidate.isVerified(), result.note(), rank, newBest);
    }

    @Transactional(readOnly = true)
    public RankingDtos.Page ranking(int page, int size) {
        if (page < 0) throw new ApiException(HttpStatus.BAD_REQUEST, "page no puede ser negativa");
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "size debe estar entre 1 y " + MAX_PAGE_SIZE);
        }
        var rows = results.ranking(PageRequest.of(page, size));
        long offset = (long) page * size;
        List<RankingDtos.Entry> entries = IntStream.range(0, rows.getContent().size())
                .mapToObj(i -> {
                    var row = rows.getContent().get(i);
                    return new RankingDtos.Entry(offset + i + 1, row.displayName(), row.playTimeSeconds(), row.achievedAt());
                })
                .toList();
        return new RankingDtos.Page(entries, page, size, rows.getTotalElements(), rows.getTotalPages());
    }
}
