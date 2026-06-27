package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface WorkoutRepository extends JpaRepository<WorkoutEntity, UUID> {

	Optional<WorkoutEntity> findByHealthkitUuid(UUID healthkitUuid);

	boolean existsByHealthkitUuid(UUID healthkitUuid);
}
