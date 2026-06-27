package to.charlie.basecamp.infrastructure.rest.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutRequest;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutResponse;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkRequest;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkResponse;

import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;

@Slf4j
@RestController
@RequestMapping("/workouts")
@RequiredArgsConstructor
public class WorkoutController {

	@PostMapping
	public ResponseEntity<CreateWorkoutResponse> createWorkout(@RequestBody CreateWorkoutRequest request) {
		log.info("POST /workouts body={}", request);
		return ResponseEntity
						.status(CREATED)
						.body(CreateWorkoutResponse.builder()
										.id(UUID.randomUUID())
								.healthkitUuid(request.healthkitUuid())
								.contentHash(request.contentHash())
								.build());
	}

	@PostMapping("/{id}/track")
	public ResponseEntity<TrackChunkResponse> trackChunk(@PathVariable String id, @RequestBody TrackChunkRequest request) {
		log.info("POST /workouts/{}/track body={}", id, request);
		return ResponseEntity
						.ok(TrackChunkResponse.builder()
								.workoutId(id)
								.sequence(request.sequence())
								.received(true)
								.build());
	}
}
