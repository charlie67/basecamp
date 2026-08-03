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

	/**
	 * Chunks left over from a previous, longer upload of the same workout: those whose sequence
	 * falls past the end of the track currently being received.
	 */
	List<TrackChunkEntity> findByWorkoutIdAndSequenceGreaterThanEqual(UUID workoutId, int sequence);

	long countByWorkoutId(UUID workoutId);
}
