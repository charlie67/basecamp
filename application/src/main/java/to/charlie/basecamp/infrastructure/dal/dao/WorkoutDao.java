package to.charlie.basecamp.infrastructure.dal.dao;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import to.charlie.basecamp.domain.model.entity.TrackStatus;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEventEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutStatisticEntity;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutEventRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutStatisticRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class WorkoutDao {

	private final WorkoutRepository workoutRepository;
	private final WorkoutStatisticRepository workoutStatisticRepository;
	private final WorkoutEventRepository workoutEventRepository;

	@Transactional(readOnly = true)
	public Page<WorkoutEntity> findAllOrdered(final Pageable pageable) {
		return workoutRepository.findAllByOrderByEndDateDesc(pageable);
	}

	@Transactional
	public WorkoutEntity upsert(final WorkoutEntity workout,
	                            final List<WorkoutStatisticEntity> statistics,
	                            final List<WorkoutEventEntity> summaryEvents) {
		findExisting(workout)
						.ifPresentOrElse(
										// Reuse the matched row's identity; healthkit_uuid is updatable=false, so a
										// duplicate re-sent under a fresh uuid keeps the original and just overwrites
										// the rest of the summary.
										existing -> workout.setId(existing.getId()),
										() -> workout.setId(UUID.randomUUID()));

		if (workout.getTrackStatus() == null) {
			workout.setTrackStatus(TrackStatus.PENDING);
		}

		final WorkoutEntity saved = workoutRepository.save(workout);

		// Replace the per-metric statistics so a re-upload never leaves stale rows.
		workoutStatisticRepository.deleteByWorkoutId(saved.getId());
		workoutStatisticRepository.flush();
		statistics.forEach(statistic -> statistic.setWorkout(saved));
		workoutStatisticRepository.saveAll(statistics);

		// Replace only the summary-level events; chunk events are owned by their chunk
		workoutEventRepository.deleteByWorkoutIdAndChunkIsNull(saved.getId());
		workoutEventRepository.flush();
		summaryEvents.forEach(event -> {
			event.setWorkout(saved);
			event.setChunk(null);
		});
		workoutEventRepository.saveAll(summaryEvents);

		return saved;
	}

	/**
	 * Finds the row an incoming summary should update. The HealthKit uuid is the primary key for
	 * de-duplication; when it is unseen, the type and start_date still catches the
	 * same workout re-sent under a fresh uuid.
	 */
	private Optional<WorkoutEntity> findExisting(final WorkoutEntity workout) {
		final Optional<WorkoutEntity> byUuid = workoutRepository.findByHealthkitUuid(workout.getHealthkitUuid());
		if (byUuid.isPresent()) {
			return byUuid;
		}
		return workoutRepository.findByTypeAndStartDate(workout.getType(), workout.getStartDate());
	}
}
