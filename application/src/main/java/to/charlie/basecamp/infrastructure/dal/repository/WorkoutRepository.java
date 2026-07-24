package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WorkoutRepository extends JpaRepository<WorkoutEntity, UUID> {

	Optional<WorkoutEntity> findByHealthkitUuid(UUID healthkitUuid);

	boolean existsByHealthkitUuid(UUID healthkitUuid);

	/**
	 * Natural-key lookup: a workout of a given type cannot start at two instants, so
	 * {@code (type, start_date)} identifies the same workout even under a fresh HealthKit uuid.
	 */
	Optional<WorkoutEntity> findByTypeAndStartDate(String type, Instant startDate);
}
