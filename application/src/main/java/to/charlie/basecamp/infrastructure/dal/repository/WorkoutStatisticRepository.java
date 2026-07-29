package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.WorkoutStatisticEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutStatisticId;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface WorkoutStatisticRepository extends JpaRepository<WorkoutStatisticEntity, WorkoutStatisticId> {

	List<WorkoutStatisticEntity> findByWorkoutId(UUID workoutId);

	List<WorkoutStatisticEntity> findByWorkoutIdIn(Collection<UUID> workoutIds);

	void deleteByWorkoutId(UUID workoutId);
}
