package dev.casino.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Una cuenta: nombre de jugador (login y nombre público), contraseña y código de recuperación, ambos como hash. */
@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    /** Como lo escribió el jugador (se muestra así en el ranking). */
    @Column(name = "player_name", nullable = false)
    private String playerName;

    /** En minúsculas: hace único el nombre sin distinguir mayúsculas (restricción única en la base de datos). */
    @Column(name = "player_name_key", nullable = false, unique = true)
    private String playerNameKey;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "recovery_code_hash", nullable = false)
    private String recoveryCodeHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected User() {}

    public User(String playerName, String passwordHash, String recoveryCodeHash) {
        this.id = UUID.randomUUID();
        this.playerName = playerName.strip();
        this.playerNameKey = PlayerNames.key(playerName);
        this.passwordHash = passwordHash;
        this.recoveryCodeHash = recoveryCodeHash;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getPlayerName() {
        return playerName;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getRecoveryCodeHash() {
        return recoveryCodeHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** Restablecer la contraseña: la nueva y un código de recuperación nuevo (el usado deja de valer). */
    public void resetCredentials(String newPasswordHash, String newRecoveryCodeHash) {
        this.passwordHash = newPasswordHash;
        this.recoveryCodeHash = newRecoveryCodeHash;
    }

    /** Sin los hashes, para que no acaben en un log. */
    @Override
    public String toString() {
        return "User[id=" + id + "]";
    }
}
