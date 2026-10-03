package dev.casino.auth;

import dev.casino.common.ApiException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    /** Un nombre público con forma de email expondría datos personales en el ranking. */
    private static final Pattern EMAIL_LIKE = Pattern.compile(".+@.+\\..+");

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final JwtService jwt;
    /** Hash de relleno: si el email no existe se compara igual, para no delatarlo por el tiempo de respuesta. */
    private final String dummyHash;

    public AuthService(UserRepository users, PasswordEncoder passwords, JwtService jwt) {
        this.users = users;
        this.passwords = passwords;
        this.jwt = jwt;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public AuthDtos.TokenResponse register(AuthDtos.RegisterRequest req) {
        String email = User.normalizeEmail(req.email());
        String name = req.displayName().strip();
        if (name.length() < 3 || EMAIL_LIKE.matcher(name).matches() || name.contains("@")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Datos no válidos",
                    java.util.List.of("displayName: no puede tener formato de email"));
        }
        if (users.existsByEmail(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "Ese email ya está registrado");
        }
        if (users.existsByDisplayNameKey(User.nameKey(name))) {
            throw new ApiException(HttpStatus.CONFLICT, "Ese nombre ya está en uso");
        }
        try {
            User user = users.saveAndFlush(new User(email, name, passwords.encode(req.password())));
            return jwt.issue(user);
        } catch (DataIntegrityViolationException e) {
            // Dos registros simultáneos con el mismo email o nombre.
            throw new ApiException(HttpStatus.CONFLICT, "Ese email o nombre ya está en uso");
        }
    }

    @Transactional(readOnly = true)
    public AuthDtos.TokenResponse login(AuthDtos.LoginRequest req) {
        var user = users.findByEmail(User.normalizeEmail(req.email()));
        String hash = user.map(User::getPasswordHash).orElse(dummyHash);
        boolean matches = passwords.matches(req.password(), hash);
        if (user.isEmpty() || !matches) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Email o contraseña incorrectos");
        }
        return jwt.issue(user.get());
    }

    @Transactional(readOnly = true)
    public User get(UUID id) {
        return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "La cuenta ya no existe"));
    }
}
