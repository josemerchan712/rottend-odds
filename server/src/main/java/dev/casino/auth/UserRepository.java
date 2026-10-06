package dev.casino.auth;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByPlayerNameKey(String playerNameKey);

    boolean existsByPlayerNameKey(String playerNameKey);

    /** Cuáles de estas claves ya están cogidas (para comprobar sugerencias en una sola consulta). */
    @Query("select u.playerNameKey from User u where u.playerNameKey in :keys")
    List<String> findTakenKeys(Collection<String> keys);
}
