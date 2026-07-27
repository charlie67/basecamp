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
import to.charlie.basecamp.domain.model.dto.common.PagedResponse;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutRequest;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutResponse;
import to.charlie.basecamp.domain.model.dto.workout.RoutePoint;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkRequest;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkResponse;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutSummaryResponse;
import to.charlie.basecamp.domain.model.entity.RoutePointEntity;
import to.charlie.basecamp.domain.model.entity.TrackChunkEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;
import to.charlie.basecamp.domain.model.mapper.TrackMapper;
import to.charlie.basecamp.domain.service.WorkoutService;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CREATED;

@Slf4j
@RestController
@RequestMapping("/workouts")
@RequiredArgsConstructor
public class WorkoutController {

	private final WorkoutService workoutService;
	private final TrackMapper trackMapper;

	@GetMapping
	public ResponseEntity<PagedResponse<WorkoutSummaryResponse>> getWorkouts(
					@RequestParam(defaultValue = "0") final int page) {
		log.info("GET /workouts - listing workouts page={}", page);
		final int safePage = Math.max(page, 0);

		final var workoutPage = workoutService.getWorkouts(PageRequest.of(safePage, 20));

		final List<UUID> workoutIds = workoutPage.getContent().stream()
						.map(WorkoutEntity::getId)
						.toList();
		final Map<UUID, List<RoutePointEntity>> routePointsByWorkout =
						workoutService.getRoutePointsByWorkoutIds(workoutIds);

		final PagedResponse<WorkoutSummaryResponse> workouts = PagedResponse.from(
						workoutPage,
						workout -> {
							final List<RoutePointEntity> allPoints = routePointsByWorkout
											.getOrDefault(workout.getId(), Collections.emptyList());
							final List<RoutePoint> routePoints = java.util.stream.IntStream.range(0, allPoints.size())
											.filter(i -> i % 20 == 0)
											.mapToObj(i -> trackMapper.toRoutePoint(allPoints.get(i)))
											.toList();
							return WorkoutSummaryResponse.builder()
											.id(workout.getId())
											.type(workout.getType())
											.startDate(workout.getStartDate())
											.endDate(workout.getEndDate())
											.routePoints(routePoints)
											.build();
						});

		return ResponseEntity.ok(workouts);
	}

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
