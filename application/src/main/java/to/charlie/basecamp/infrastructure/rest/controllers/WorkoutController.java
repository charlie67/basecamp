package to.charlie.basecamp.infrastructure.rest.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutRequest;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutResponse;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkRequest;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkResponse;
import to.charlie.basecamp.domain.model.entity.TrackChunkEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;
import to.charlie.basecamp.domain.service.WorkoutService;

import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;

@Slf4j
@RestController
@RequestMapping("/workouts")
@RequiredArgsConstructor
public class WorkoutController {

	private final WorkoutService workoutService;

	@PostMapping
	public ResponseEntity<CreateWorkoutResponse> createWorkout(@RequestBody final CreateWorkoutRequest request) {
		log.info("POST /workouts - upserting workout healthkit_uuid={}", request.healthkitUuid());
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
