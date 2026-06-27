package to.charlie.basecamp.infrastructure.dal.dao;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutEventRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutStatisticRepository;

/**
 * Data access for the workout summary aggregate ({@code POST /workouts}).
 * Encapsulates the upsert-by-{@code healthkit_uuid} flow and the replace-on-reupload
 * semantics for the workout's statistics and summary-level events.
 */
@Component
@RequiredArgsConstructor
public class WorkoutDao {

	private final WorkoutRepository workoutRepository;
	private final WorkoutStatisticRepository workoutStatisticRepository;
	private final WorkoutEventRepository workoutEventRepository;

}
