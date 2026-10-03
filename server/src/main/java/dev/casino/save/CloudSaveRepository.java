package dev.casino.save;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CloudSaveRepository extends JpaRepository<CloudSave, UUID> {

    /** Bloquea la fila: dos PUT simultáneos del mismo usuario no pueden pisarse. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from CloudSave s where s.userId = :userId")
    Optional<CloudSave> findForUpdate(@Param("userId") UUID userId);
}
