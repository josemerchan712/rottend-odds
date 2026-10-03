package dev.casino.ranking;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Mejor resultado de un usuario al saldar la deuda de la mesa 1. */
@Entity
@Table(name = "debt_results")
public class DebtResult {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "play_time_seconds", nullable = false)
    private double playTimeSeconds;

    @Column(nullable = false)
    private boolean verified;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DebtResult() {}

    public DebtResult(UUID userId, double playTimeSeconds, boolean verified) {
        this.userId = userId;
        this.playTimeSeconds = playTimeSeconds;
        this.verified = verified;
        this.createdAt = Instant.now();
    }

    /** Un resultado verificado siempre gana a uno sin verificar; entre iguales, el más rápido. */
    public boolean isBetterThan(DebtResult other) {
        if (verified != other.verified) return verified;
        return playTimeSeconds < other.playTimeSeconds;
    }

    public UUID getUserId() {
        return userId;
    }

    public double getPlayTimeSeconds() {
        return playTimeSeconds;
    }

    public boolean isVerified() {
        return verified;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
