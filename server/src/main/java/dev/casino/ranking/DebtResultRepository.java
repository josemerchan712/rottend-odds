package dev.casino.ranking;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DebtResultRepository extends JpaRepository<DebtResult, UUID> {

    /** Solo resultados verificados, del más rápido al más lento (a igualdad, el primero en llegar). */
    @Query(value = """
            select new dev.casino.ranking.RankingDtos$Row(u.displayName, r.playTimeSeconds, r.createdAt)
            from DebtResult r join User u on u.id = r.userId
            where r.verified = true
            order by r.playTimeSeconds asc, r.createdAt asc
            """,
            countQuery = "select count(r) from DebtResult r where r.verified = true")
    Page<RankingDtos.Row> ranking(Pageable pageable);

    long countByVerifiedTrueAndPlayTimeSecondsLessThan(double playTimeSeconds);
}
