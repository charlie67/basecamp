package to.charlie.basecamp.infrastructure.rest.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import to.charlie.basecamp.domain.model.dto.WorkoutSearchCriteriaDto;
import to.charlie.basecamp.domain.model.dto.common.PagedResponse;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutRequest;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutResponse;
import to.charlie.basecamp.domain.model.dto.workout.MetricSample;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkRequest;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkResponse;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutManifestResponse;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutSummaryResponse;
import to.charlie.basecamp.domain.model.entity.TrackChunkEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;
import to.charlie.basecamp.domain.service.WorkoutService;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

import static org.springframework.http.HttpStatus.CREATED;

@Slf4j
@RestController
@RequestMapping("/workouts")
@RequiredArgsConstructor
public class WorkoutController {

	private final WorkoutService workoutService;

	@GetMapping
	public ResponseEntity<PagedResponse<WorkoutSummaryResponse>> getWorkouts(
					@RequestParam(defaultValue = "0") final int page) {
		log.info("GET /workouts - listing workouts page={}", page);
		final int safePage = Math.max(page, 0);

		final var workoutPage = workoutService.getWorkouts(PageRequest.of(safePage, 20));

		return ResponseEntity.ok(PagedResponse.from(workoutPage, Function.identity()));
	}

	@GetMapping("/search")
	public ResponseEntity<List<WorkoutSummaryResponse>> searchWorkouts(
					@RequestParam(required = false) final Instant from,
					@RequestParam(required = false) final Instant to,
					// Request params are not covered by the snake-case Jackson strategy, which only
					// applies to bodies, so the wire names are spelled out.
					@RequestParam(name = "min_lat", required = false) final Double minLat,
					@RequestParam(name = "max_lat", required = false) final Double maxLat,
					@RequestParam(name = "min_lon", required = false) final Double minLon,
					@RequestParam(name = "max_lon", required = false) final Double maxLon) {
		log.info("GET /workouts/search - from={} to={} bbox=[{},{} {},{}]",
						from, to, minLat, minLon, maxLat, maxLon);
		final WorkoutSearchCriteriaDto criteria = WorkoutSearchCriteriaDto.of(from, to, minLat, maxLat, minLon, maxLon);

		return ResponseEntity.ok(workoutService.searchWorkouts(criteria));
	}

	@GetMapping("/{id}/series/{metric}")
	public ResponseEntity<List<MetricSample>> getSeries(@PathVariable final UUID id,
	                                                    @PathVariable final String metric) {
		log.info("GET /workouts/{}/series/{}", id, metric);

		return ResponseEntity.ok(workoutService.getSeries(id, metric));
	}

	/**
	 * What the server already holds for a workout, keyed by its HealthKit uuid, so a client can
	 * decide whether it needs to upload at all - after a reinstall, or when backfilling a history
	 * that is mostly current already.
	 *
	 * <p>A 404 means "not here, send it": the ordinary answer for a workout the server has never
	 * seen, not an error worth retrying.
	 */
	@GetMapping("/by-healthkit-uuid/{healthkitUuid}")
	public ResponseEntity<WorkoutManifestResponse> getManifest(@PathVariable final UUID healthkitUuid) {
		log.info("GET /workouts/by-healthkit-uuid/{}", healthkitUuid);

		return workoutService.getManifest(healthkitUuid)
						.map(ResponseEntity::ok)
						.orElseGet(() -> ResponseEntity.notFound().build());
	}

	@PostMapping
	public ResponseEntity<CreateWorkoutResponse> createWorkout(@RequestBody final CreateWorkoutRequest request) {
		log.info("POST /workouts - adding workout healthkit_uuid={}", request.healthkitUuid());
		final WorkoutEntity workout = workoutService.createWorkout(request);

		return ResponseEntity
						.status(CREATED)
						.body(CreateWorkoutResponse.builder()
										.id(workout.getId())
										.healthkitUuid(request.healthkitUuid())
										.contentHash(workout.getContentHash())
										.updatedAt(workout.getUpdatedAt())
										.build());
	}

	@PostMapping("/{id}/track")
	public ResponseEntity<TrackChunkResponse> trackChunk(@PathVariable final String id, @RequestBody final TrackChunkRequest request) {
		log.info("POST /workouts/{}/track - saving chunk sequence={}", id, request.sequence());
		final TrackChunkEntity chunk = workoutService.saveTrackChunk(UUID.fromString(id), request);

		return ResponseEntity
						.ok(TrackChunkResponse.builder()
										.workoutId(id)
										.sequence(chunk.getSequence())
										.received(true)
										.build());
	}
}
