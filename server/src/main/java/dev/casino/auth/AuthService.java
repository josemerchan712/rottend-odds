package dev.casino.auth;

import dev.casino.common.ApiException;
import dev.casino.ranking.DebtResultRepository;
import dev.casino.save.CloudSaveRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.random.RandomGenerator;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Cuentas sin email: nombre de jugador + contraseña, y un código de recuperación para restablecerla.
 *
 * <p>El alta va en su propia transacción corta: si dos registros con el mismo nombre llegan a la vez, la
 * restricción única de la base de datos rechaza el segundo y aquí se convierte en 409 con sugerencias (que
 * se buscan fuera de esa transacción: en PostgreSQL una transacción que ha fallado ya no admite consultas).
 */
@Service
public class AuthService {

    /** Mensaje único para cualquier fallo de login o de restablecer: nunca dice si el nombre existe. */
    static final String LOGIN_ERROR = "Nombre de jugador o contraseña incorrectos";
    static final String RESET_ERROR = "Nombre de jugador o código de recuperación incorrectos";
    static final int MAX_SUGGESTIONS = 5;

    private final UserRepository users;
    private final CloudSaveRepository saves;
    private final DebtResultRepository results;
    private final PasswordEncoder passwords;
    private final JwtService jwt;
    private final TransactionTemplate tx;
    private final RandomGenerator random = new SecureRandom();
    /** Hash de relleno: si el nombre no existe se compara igual, para no delatarlo por el tiempo de respuesta. */
    private final String dummyHash;

    public AuthService(UserRepository users, CloudSaveRepository saves, DebtResultRepository results, PasswordEncoder passwords,
            JwtService jwt, PlatformTransactionManager txManager) {
        this.users = users;
        this.saves = saves;
        this.results = results;
        this.passwords = passwords;
        this.jwt = jwt;
        this.tx = new TransactionTemplate(txManager);
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    public AuthDtos.TokenResponse register(AuthDtos.RegisterRequest req) {
        String name = req.playerName().strip();
        Optional<PlayerNames.Problem> problem = PlayerNames.problem(name);
        if (problem.isPresent()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Datos no válidos", List.of("playerName: " + problem.get().message));
        }
        checkPassword(name, req.password());
        if (users.existsByPlayerNameKey(PlayerNames.key(name))) throw nameTaken(name);
        String code = RecoveryCodes.generate();
        User user = new User(name, passwords.encode(req.password()), passwords.encode(RecoveryCodes.normalize(code)));
        try {
            tx.executeWithoutResult(status -> users.saveAndFlush(user));
        } catch (DataIntegrityViolationException e) {
            // Dos registros simultáneos con el mismo nombre: el segundo choca con la restricción única.
            throw nameTaken(name);
        }
        return jwt.issue(user).withRecoveryCode(code);
    }

    private ApiException nameTaken(String name) {
        return new ApiException(HttpStatus.CONFLICT, "Ese nombre ya está en uso", List.of(), suggestions(name));
    }

    /** Hasta cinco nombres libres ahora mismo, con formato válido y que pasan el filtro. */
    @Transactional(readOnly = true)
    public List<String> suggestions(String name) {
        List<String> candidates = PlayerNames.candidates(name, random);
        Map<String, String> byKey = new LinkedHashMap<>();
        for (String c : candidates) byKey.putIfAbsent(PlayerNames.key(c), c);
        Set<String> taken = new HashSet<>(users.findTakenKeys(byKey.keySet()));
        List<String> free = new ArrayList<>();
        for (var entry : byKey.entrySet()) {
            if (!taken.contains(entry.getKey())) free.add(entry.getValue());
            if (free.size() == MAX_SUGGESTIONS) break;
        }
        return free;
    }

    private static void checkPassword(String name, String password) {
        if (password.strip().equalsIgnoreCase(name.strip())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Datos no válidos", List.of("password: no puede ser igual que el nombre de jugador"));
        }
    }

    @Transactional(readOnly = true)
    public AuthDtos.TokenResponse login(AuthDtos.LoginRequest req) {
        var user = users.findByPlayerNameKey(PlayerNames.key(req.playerName()));
        String hash = user.map(User::getPasswordHash).orElse(dummyHash);
        boolean matches = passwords.matches(req.password(), hash);
        if (user.isEmpty() || !matches) throw new ApiException(HttpStatus.UNAUTHORIZED, LOGIN_ERROR);
        return jwt.issue(user.get());
    }

    /** ¿Se puede usar este nombre? Para el aviso mientras se escribe (con su propio límite de intentos). */
    @Transactional(readOnly = true)
    public AuthDtos.NameCheckResponse checkName(String raw) {
        String name = raw == null ? "" : raw.strip();
        Optional<PlayerNames.Problem> problem = PlayerNames.problem(name);
        if (problem.isPresent()) {
            String reason = switch (problem.get()) {
                case FORMATO -> "formato";
                case RESERVADO -> "reservado";
                case NO_PERMITIDO -> "no-permitido";
            };
            return new AuthDtos.NameCheckResponse(name, false, reason, problem.get().message, List.of());
        }
        if (users.existsByPlayerNameKey(PlayerNames.key(name))) {
            return new AuthDtos.NameCheckResponse(name, false, "ocupado", "Ese nombre ya está en uso", suggestions(name));
        }
        return new AuthDtos.NameCheckResponse(name, true, null, null, List.of());
    }

    /**
     * Restablecer la contraseña con el código de recuperación: si coinciden nombre y código, cambia la contraseña
     * e invalida el código usado (se entrega uno nuevo, que solo se ve en esta respuesta).
     */
    @Transactional
    public AuthDtos.TokenResponse resetPassword(AuthDtos.ResetRequest req) {
        var user = users.findByPlayerNameKey(PlayerNames.key(req.playerName()));
        String hash = user.map(User::getRecoveryCodeHash).orElse(dummyHash);
        boolean matches = passwords.matches(RecoveryCodes.normalize(req.recoveryCode()), hash);
        if (user.isEmpty() || !matches) throw new ApiException(HttpStatus.UNAUTHORIZED, RESET_ERROR);
        User u = user.get();
        checkPassword(u.getPlayerName(), req.newPassword());
        String code = RecoveryCodes.generate();
        u.resetCredentials(passwords.encode(req.newPassword()), passwords.encode(RecoveryCodes.normalize(code)));
        users.saveAndFlush(u);
        return jwt.issue(u).withRecoveryCode(code);
    }

    @Transactional(readOnly = true)
    public User get(UUID id) {
        return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "La cuenta ya no existe"));
    }

    /** Borra la cuenta y todos sus datos (guardado en la nube y resultado del ranking caen en cascada). */
    @Transactional
    public void deleteAccount(UUID id) {
        User user = get(id);
        saves.deleteById(user.getId());
        results.deleteById(user.getId());
        users.delete(user);
    }

    /** Todos los datos de la cuenta, para descargarlos (sin hashes). */
    @Transactional(readOnly = true)
    public Map<String, Object> export(UUID id) {
        User user = get(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("playerName", user.getPlayerName());
        out.put("createdAt", user.getCreatedAt());
        out.put("exportedAt", Instant.now());
        saves.findById(id).ifPresentOrElse(s -> {
            Map<String, Object> save = new LinkedHashMap<>();
            save.put("revision", s.getRevision());
            save.put("saveVersion", s.getSaveVersion());
            save.put("updatedAt", s.getUpdatedAt());
            save.put("verified", s.isVerified());
            save.put("data", s.getData());
            out.put("cloudSave", save);
        }, () -> out.put("cloudSave", null));
        results.findById(id).ifPresentOrElse(r -> {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("playTimeSeconds", r.getPlayTimeSeconds());
            result.put("verified", r.isVerified());
            result.put("createdAt", r.getCreatedAt());
            out.put("rankingResult", result);
        }, () -> out.put("rankingResult", null));
        return out;
    }
}
