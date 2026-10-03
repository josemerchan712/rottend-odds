package dev.casino.save;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** El único hueco de guardado de cada usuario. */
@Entity
@Table(name = "cloud_saves")
public class CloudSave {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    /** Sube con cada escritura; el cliente la envía para detectar conflictos. */
    @Column(nullable = false)
    private long revision;

    @Column(name = "save_version", nullable = false)
    private int saveVersion;

    /** La partida tal cual la serializa el juego (JSON). */
    @Column(nullable = false, columnDefinition = "text")
    private String data;

    @Column(name = "play_time", nullable = false)
    private double playTime;

    @Column(nullable = false)
    private double balance;

    @Column(name = "debt_paid", nullable = false)
    private boolean debtPaid;

    @Column(nullable = false)
    private boolean verified;

    @Column(name = "verification_note")
    private String verificationNote;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CloudSave() {}

    public CloudSave(UUID userId) {
        this.userId = userId;
        this.revision = 0;
    }

    public void write(int saveVersion, String data, double playTime, double balance, boolean debtPaid,
            boolean verified, String note) {
        this.revision++;
        this.saveVersion = saveVersion;
        this.data = data;
        this.playTime = playTime;
        this.balance = balance;
        this.debtPaid = debtPaid;
        this.verified = verified;
        this.verificationNote = note == null ? null : note.substring(0, Math.min(note.length(), 255));
        this.updatedAt = Instant.now();
    }

    public UUID getUserId() {
        return userId;
    }

    public long getRevision() {
        return revision;
    }

    public int getSaveVersion() {
        return saveVersion;
    }

    public String getData() {
        return data;
    }

    public double getPlayTime() {
        return playTime;
    }

    public double getBalance() {
        return balance;
    }

    public boolean isDebtPaid() {
        return debtPaid;
    }

    public boolean isVerified() {
        return verified;
    }

    public String getVerificationNote() {
        return verificationNote;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
