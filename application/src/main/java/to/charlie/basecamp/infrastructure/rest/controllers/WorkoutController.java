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

import java.time.Instant;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;

@Slf4j
@RestController
@RequestMapping("/workouts")
@RequiredArgsConstructor
public class WorkoutController {

	@PostMapping
	public ResponseEntity<CreateWorkoutResponse> createWorkout(@RequestBody final CreateWorkoutRequest request) {
		log.info("POST /workouts - adding new workout");
		final var x = ResponseEntity
						.status(CREATED)
						.body(CreateWorkoutResponse.builder()
										.id(UUID.randomUUID())
										.healthkitUuid(request.healthkitUuid())
										.contentHash(request.contentHash())
										.updatedAt(Instant.now())
										.build());

		return x;
	}

	@PostMapping("/{id}/track")
	public ResponseEntity<TrackChunkResponse> trackChunk(@PathVariable final String id, @RequestBody final TrackChunkRequest request) {
		log.info("POST /workouts/{}/track - adding new track", id);
		return ResponseEntity
						.ok(TrackChunkResponse.builder()
										.workoutId(id)
										.sequence(request.sequence())
										.received(true)
										.build());
	}
}
