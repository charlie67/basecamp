package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.WorkoutEventEntity;

import java.util.List;
import java.util.UUID;

@Repository
public interface WorkoutEventRepository extends JpaRepository<WorkoutEventEntity, Long> {

	List<WorkoutEventEntity> findByWorkoutId(UUID workoutId);

	/**
	 * Delete events that arrived with the workout summary (no chunk).
	 */
	void deleteByWorkoutIdAndChunkIsNull(UUID workoutId);

	/**
	 * Delete events that arrived with a given chunk, for clean reprocessing.
	 */
	void deleteByChunkId(UUID chunkId);
}
