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
}
