package to.charlie.basecamp.infrastructure.rest.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
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
import to.charlie.basecamp.domain.model.dto.workout.StatisticSummary;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkRequest;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkResponse;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutSummaryResponse;
import to.charlie.basecamp.domain.model.entity.TrackChunkEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutStatisticEntity;
import to.charlie.basecamp.domain.model.mapper.WorkoutMapper;
import to.charlie.basecamp.domain.model.query.WorkoutSearchCriteria;
import to.charlie.basecamp.domain.service.WorkoutService;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.CREATED;

@Slf4j
@RestController
@RequestMapping("/workouts")
@RequiredArgsConstructor
public class WorkoutController {

	private final WorkoutService workoutService;
	private final WorkoutMapper workoutMapper;

	@GetMapping
	public ResponseEntity<PagedResponse<WorkoutSummaryResponse>> getWorkouts(
					@RequestParam(defaultValue = "0") final int page) {
		log.info("GET /workouts - listing workouts page={}", page);
		final int safePage = Math.max(page, 0);

		final var workoutPage = workoutService.getWorkouts(PageRequest.of(safePage, 20));

		return ResponseEntity.ok(toPagedResponse(workoutPage));
	}

	@GetMapping("/search")
	public ResponseEntity<PagedResponse<WorkoutSummaryResponse>> searchWorkouts(
					@RequestParam(required = false) final Instant from,
					@RequestParam(required = false) final Instant to,
					// Request params are not covered by the snake-case Jackson strategy, which only
					// applies to bodies, so the wire names are spelled out.
					@RequestParam(name = "min_lat", required = false) final Double minLat,
					@RequestParam(name = "max_lat", required = false) final Double maxLat,
					@RequestParam(name = "min_lon", required = false) final Double minLon,
					@RequestParam(name = "max_lon", required = false) final Double maxLon,
					@RequestParam(defaultValue = "0") final int page) {
		log.info("GET /workouts/search - from={} to={} bbox=[{},{} {},{}] page={}",
						from, to, minLat, minLon, maxLat, maxLon, page);
		final int safePage = Math.max(page, 0);
		final WorkoutSearchCriteria criteria = WorkoutSearchCriteria.of(from, to, minLat, maxLat, minLon, maxLon);

		final var workoutPage = workoutService.searchWorkouts(criteria, PageRequest.of(safePage, 20));

		return ResponseEntity.ok(toPagedResponse(workoutPage));
	}

	private PagedResponse<WorkoutSummaryResponse> toPagedResponse(final Page<WorkoutEntity> workoutPage) {
		final List<UUID> workoutIds = workoutPage.getContent().stream()
						.map(WorkoutEntity::getId)
						.toList();
		final Map<UUID, List<RoutePoint>> routePointsByWorkout =
						workoutService.getRoutePointsByWorkoutIds(workoutIds);
		final Map<UUID, List<WorkoutStatisticEntity>> statisticsByWorkout =
						workoutService.getStatisticsByWorkoutIds(workoutIds);

		return PagedResponse.from(
						workoutPage,
						workout -> {
							final List<RoutePoint> routePoints = routePointsByWorkout
											.getOrDefault(workout.getId(), Collections.emptyList());
							final Map<String, StatisticSummary> statistics = statisticsByWorkout
											.getOrDefault(workout.getId(), Collections.emptyList())
											.stream()
											.collect(Collectors.toMap(
															statistic -> statistic.getId().getName(),
															workoutMapper::toStatisticSummary));
							return WorkoutSummaryResponse.builder()
											.id(workout.getId())
											.type(workout.getType())
											.startDate(workout.getStartDate())
											.endDate(workout.getEndDate())
											.durationSeconds(workout.getDurationSeconds())
											.distanceM(workout.getDistanceM())
											.elevationGainM(workout.getElevationGainM())
											.elevationLossM(workout.getElevationLossM())
											.activeCalories(workout.getActiveCalories())
											.basalCalories(workout.getBasalCalories())
											.routePointCount(workout.getRoutePointCount())
											.statistics(statistics)
											.routePoints(routePoints)
											.build();
						});
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
