package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.TrackChunkEntity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TrackChunkRepository extends JpaRepository<TrackChunkEntity, UUID> {

	boolean existsByWorkoutIdAndSequence(UUID workoutId, int sequence);

	Optional<TrackChunkEntity> findByWorkoutIdAndSequence(UUID workoutId, int sequence);

	List<TrackChunkEntity> findByWorkoutIdOrderBySequenceAsc(UUID workoutId);

	long countByWorkoutId(UUID workoutId);
}
