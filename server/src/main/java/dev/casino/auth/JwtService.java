package dev.casino.auth;

import dev.casino.config.AppProperties;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/** Emite tokens HS256 con el id del usuario como `sub`. Sin refresh token: caducan en 24 h. */
@Service
public class JwtService {

    private final JwtEncoder encoder;
    private final AppProperties.Jwt props;

    public JwtService(JwtEncoder encoder, AppProperties props) {
        this.encoder = encoder;
        this.props = props.jwt();
    }

    public AuthDtos.TokenResponse issue(User user) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(props.ttl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(expiresAt)
                .claim("name", user.getPlayerName())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new AuthDtos.TokenResponse(token, expiresAt, user.getPlayerName());
    }

    public static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
