package dev.casino.save;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.casino.common.ApiException;
import dev.casino.config.AppProperties;
import dev.casino.validation.SaveValidator;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SaveService {

    private final CloudSaveRepository saves;
    private final SaveValidator validator;
    private final ObjectMapper mapper;
    private final int maxBytes;

    public SaveService(CloudSaveRepository saves, SaveValidator validator, ObjectMapper mapper, AppProperties props) {
        this.saves = saves;
        this.validator = validator;
        this.mapper = mapper;
        this.maxBytes = props.save().maxBytes();
    }

    @Transactional(readOnly = true)
    public SaveDtos.SaveResponse get(UUID userId) {
        return saves.findById(userId)
                .map(this::toResponse)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No hay partida guardada en la nube"));
    }

    /**
     * Escribe el guardado si el cliente parte de la última revisión. Si no, lanza un conflicto con
     * el guardado del servidor. Para sobrescribirlo, el cliente reenvía con la revisión del servidor.
     */
    @Transactional
    public SaveDtos.SaveResponse put(UUID userId, Long baseRevision, JsonNode data) {
        String serialized = serialize(data);
        SaveValidator.Result result = validator.validate(data);

        CloudSave save = saves.findForUpdate(userId).orElse(null);
        if (save != null && !Objects.equals(baseRevision, save.getRevision())) {
            throw new SaveConflictException(toResponse(save));
        }
        if (save == null) save = new CloudSave(userId);

        var snap = result.snapshot();
        save.write(snap.saveVersion(), serialized, snap.playTime(), snap.balance(), snap.debtPaid(),
                result.verified(), result.note());
        try {
            return toResponse(saves.saveAndFlush(save));
        } catch (DataIntegrityViolationException e) {
            // Dos primeros guardados simultáneos: el segundo choca con la clave primaria.
            throw new ApiException(HttpStatus.CONFLICT, "Otro dispositivo acaba de guardar; vuelve a sincronizar");
        }
    }

    private String serialize(JsonNode data) {
        try {
            String text = mapper.writeValueAsString(data);
            if (text.getBytes(StandardCharsets.UTF_8).length > maxBytes) {
                throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "El guardado supera " + maxBytes + " bytes");
            }
            return text;
        } catch (JsonProcessingException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "El guardado no es JSON válido");
        }
    }

    private SaveDtos.SaveResponse toResponse(CloudSave s) {
        JsonNode data;
        try {
            data = mapper.readTree(s.getData());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Guardado corrupto en la base de datos", e);
        }
        return new SaveDtos.SaveResponse(s.getRevision(), s.getSaveVersion(), data, s.getPlayTime(), s.getBalance(),
                s.isDebtPaid(), s.isVerified(), s.getVerificationNote(), s.getUpdatedAt());
    }
}
