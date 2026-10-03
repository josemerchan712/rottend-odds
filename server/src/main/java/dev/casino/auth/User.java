package dev.casino.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    /** Nombre en minúsculas: hace único el nombre sin distinguir mayúsculas. */
    @Column(name = "display_name_key", nullable = false, unique = true)
    private String displayNameKey;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected User() {}

    public User(String email, String displayName, String passwordHash) {
        this.id = UUID.randomUUID();
        this.email = normalizeEmail(email);
        this.displayName = displayName.strip();
        this.displayNameKey = nameKey(displayName);
        this.passwordHash = passwordHash;
        this.createdAt = Instant.now();
    }

    public static String normalizeEmail(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    public static String nameKey(String displayName) {
        return displayName.strip().toLowerCase(Locale.ROOT);
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** Sin el hash ni el email, para que no acaben en un log. */
    @Override
    public String toString() {
        return "User[id=" + id + ", displayName=" + displayName + "]";
    }
}
