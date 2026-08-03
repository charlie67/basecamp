package to.charlie.basecamp.infrastructure.dal.dao;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import to.charlie.basecamp.domain.model.entity.RoutePointEntity;
import to.charlie.basecamp.domain.model.entity.SeriesPointEntity;
import to.charlie.basecamp.domain.model.entity.TrackChunkEntity;
import to.charlie.basecamp.domain.model.entity.TrackStatus;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEventEntity;
import to.charlie.basecamp.infrastructure.dal.repository.RoutePointRepository;
import to.charlie.basecamp.infrastructure.dal.repository.SeriesPointRepository;
import to.charlie.basecamp.infrastructure.dal.repository.TrackChunkRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutEventRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutRepository;

import java.util.List;
import java.util.UUID;


@Component
@RequiredArgsConstructor
public class TrackDao {

	private final TrackChunkRepository trackChunkRepository;
	private final RoutePointRepository routePointRepository;
	private final SeriesPointRepository seriesPointRepository;
	private final WorkoutEventRepository workoutEventRepository;
	private final WorkoutRepository workoutRepository;

	@Transactional
	public TrackChunkEntity saveChunk(final UUID workoutId,
	                                  final TrackChunkEntity chunk,
	                                  final List<RoutePointEntity> routePoints,
	                                  final List<SeriesPointEntity> seriesPoints,
	                                  final List<WorkoutEventEntity> events) {
		final WorkoutEntity workout = workoutRepository.findById(workoutId)
						.orElseThrow(() -> new EntityNotFoundException("Workout not found: " + workoutId));

		discardChunksPastEndOfTrack(workoutId, chunk.getChunkCount());

		final TrackChunkEntity chunkToSave = trackChunkRepository
						.findByWorkoutIdAndSequence(workoutId, chunk.getSequence())
						.map(existing -> {
							// Idempotent resend: drop this chunk's children and refresh the header.
							routePointRepository.deleteByChunkId(existing.getId());
							seriesPointRepository.deleteByChunkId(existing.getId());
							workoutEventRepository.deleteByChunkId(existing.getId());
							existing.setChunkCount(chunk.getChunkCount());
							existing.setFinal(chunk.isFinal());
							existing.setStartAt(chunk.getStartAt());
							existing.setEndAt(chunk.getEndAt());
							return existing;
						})
						.orElse(chunk);
		chunkToSave.setWorkout(workout);
		final TrackChunkEntity savedChunk = trackChunkRepository.saveAndFlush(chunkToSave);

		routePoints.forEach(point -> {
			point.setWorkout(workout);
			point.setChunk(savedChunk);
		});
		routePointRepository.saveAll(routePoints);

		seriesPoints.forEach(point -> {
			point.setWorkout(workout);
			point.setChunk(savedChunk);
		});
		seriesPointRepository.saveAll(seriesPoints);

		events.forEach(event -> {
			event.setWorkout(workout);
			event.setChunk(savedChunk);
		});
		workoutEventRepository.saveAll(events);

		workout.setTrackStatus(chunk.isFinal() ? TrackStatus.COMPLETE : TrackStatus.RECEIVING);
		workout.setExpectedChunks(chunk.getChunkCount());
		workoutRepository.save(workout);

		return savedChunk;
	}

	/**
	 * Drops chunks left behind by a previous, longer upload of the same workout.
	 *
	 * <p>A resend replaces the chunks it actually carries, but a re-upload can be <em>shorter</em>
	 * than the one before it — the client re-chunks from whatever HealthKit returns at the time, and
	 * a workout whose GPS route fails to load degrades to a single routeless chunk where it once had
	 * dozens. Without this, sequences past the new end survive untouched, and because route and
	 * series points are read back by {@code workout_id} rather than by chunk, their stale contents
	 * interleave with the fresh ones instead of being replaced by them.
	 *
	 * <p>Children go first and explicitly, matching the replace path above, rather than leaning on
	 * the schema's {@code on delete cascade}: the cascade fires in the database, which would leave
	 * the deleted rows sitting in Hibernate's persistence context for the rest of the transaction.
	 */
	private void discardChunksPastEndOfTrack(final UUID workoutId, final int chunkCount) {
		final List<TrackChunkEntity> orphans =
						trackChunkRepository.findByWorkoutIdAndSequenceGreaterThanEqual(workoutId, chunkCount);
		if (orphans.isEmpty()) {
			return;
		}
		orphans.forEach(orphan -> {
			routePointRepository.deleteByChunkId(orphan.getId());
			seriesPointRepository.deleteByChunkId(orphan.getId());
			workoutEventRepository.deleteByChunkId(orphan.getId());
		});
		trackChunkRepository.deleteAll(orphans);
		trackChunkRepository.flush();
	}
}
