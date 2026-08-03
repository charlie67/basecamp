package to.charlie.basecamp.domain.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import to.charlie.basecamp.domain.model.dto.WorkoutSearchCriteriaDto;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutRequest;
import to.charlie.basecamp.domain.model.dto.workout.MetricSample;
import to.charlie.basecamp.domain.model.dto.workout.RoutePoint;
import to.charlie.basecamp.domain.model.dto.workout.SeriesPoint;
import to.charlie.basecamp.domain.model.dto.workout.StatisticSummary;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkRequest;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutEvent;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutManifestResponse;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutSummaryResponse;
import to.charlie.basecamp.domain.model.entity.RoutePointEntity;
import to.charlie.basecamp.domain.model.entity.SeriesPointEntity;
import to.charlie.basecamp.domain.model.entity.TrackChunkEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEventEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutStatisticEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutStatisticId;
import to.charlie.basecamp.domain.model.mapper.TrackMapper;
import to.charlie.basecamp.domain.model.mapper.WorkoutMapper;
import to.charlie.basecamp.infrastructure.dal.dao.TrackDao;
import to.charlie.basecamp.infrastructure.dal.dao.WorkoutDao;
import to.charlie.basecamp.infrastructure.dal.projection.RoutePointProjection;
import to.charlie.basecamp.infrastructure.dal.repository.RoutePointRepository;
import to.charlie.basecamp.infrastructure.dal.repository.SeriesPointRepository;
import to.charlie.basecamp.infrastructure.dal.repository.TrackChunkRepository;
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutStatisticRepository;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Application service for HealthKit workout ingest: maps the REST DTOs onto the
 * persistence model and delegates the upsert / chunk-append flows to the DAOs.
 */
@Service
@RequiredArgsConstructor
public class WorkoutService {

	private static final int ROUTE_POINT_STRIDE = 20;

	private static final int MAX_SERIES_SAMPLES = 600;

	private final WorkoutMapper workoutMapper;
	private final TrackMapper trackMapper;
	private final WorkoutDao workoutDao;
	private final TrackDao trackDao;
	private final RoutePointRepository routePointRepository;
	private final SeriesPointRepository seriesPointRepository;
	private final WorkoutStatisticRepository workoutStatisticRepository;
	private final TrackChunkRepository trackChunkRepository;

	public Page<WorkoutSummaryResponse> getWorkouts(final Pageable pageable) {
		final Page<WorkoutEntity> workoutPage = workoutDao.findAllOrdered(pageable);
		return workoutPage.map(summaryConverter(workoutPage.getContent()));
	}

	public List<WorkoutSummaryResponse> searchWorkouts(final WorkoutSearchCriteriaDto criteria) {
		final List<WorkoutEntity> workouts = workoutDao.search(criteria);
		return workouts.stream()
						.map(summaryConverter(workouts))
						.toList();
	}

	public List<MetricSample> getSeries(final UUID workoutId, final String metric) {
		return seriesPointRepository
						.findThinnedByWorkoutIdAndMetric(workoutId, metric, MAX_SERIES_SAMPLES)
						.stream()
						.map(sample -> new MetricSample(sample.getT(), sample.getE(), sample.getValue()))
						.toList();
	}

	private Function<WorkoutEntity, WorkoutSummaryResponse> summaryConverter(final List<WorkoutEntity> workouts) {
		final List<UUID> workoutIds = workouts.stream()
						.map(WorkoutEntity::getId)
						.toList();
		final Map<UUID, List<RoutePoint>> routePointsByWorkout = getRoutePointsByWorkoutIds(workoutIds);
		final Map<UUID, List<WorkoutStatisticEntity>> statisticsByWorkout = getStatisticsByWorkoutIds(workoutIds);

		return workout -> {
			final List<RoutePoint> routePoints = routePointsByWorkout
							.getOrDefault(workout.getId(), List.of());
			final Map<String, StatisticSummary> statistics = statisticsByWorkout
							.getOrDefault(workout.getId(), List.of())
							.stream()
							.collect(Collectors.toMap(
											statistic -> statistic.getId().getName(),
											workoutMapper::toStatisticSummary));
			return workoutMapper.toSummaryResponse(workout, statistics, routePoints);
		};
	}

	/**
	 * The map's polylines for a page of workouts, already thinned to every
	 * {@link #ROUTE_POINT_STRIDE}-th fix and grouped by workout.
	 */
	private Map<UUID, List<RoutePoint>> getRoutePointsByWorkoutIds(final Collection<UUID> workoutIds) {
		if (workoutIds.isEmpty()) {
			return Map.of();
		}
		final List<RoutePointProjection> allPoints =
						routePointRepository.findThinnedByWorkoutIds(workoutIds, ROUTE_POINT_STRIDE);
		final Map<UUID, List<RoutePoint>> grouped = new java.util.LinkedHashMap<>();
		for (final RoutePointProjection point : allPoints) {
			// The projection carries the workout FK as a plain column, so grouping never has to
			// touch a lazy association.
			grouped.computeIfAbsent(point.getWorkoutId(), k -> new ArrayList<>())
							.add(trackMapper.toRoutePoint(point));
		}
		return grouped;
	}

	private Map<UUID, List<WorkoutStatisticEntity>> getStatisticsByWorkoutIds(final Collection<UUID> workoutIds) {
		if (workoutIds.isEmpty()) {
			return Map.of();
		}
		final List<WorkoutStatisticEntity> allStatistics = workoutStatisticRepository.findByWorkoutIdIn(workoutIds);
		final Map<UUID, List<WorkoutStatisticEntity>> grouped = new java.util.LinkedHashMap<>();
		for (final WorkoutStatisticEntity statistic : allStatistics) {
			// The embedded id already carries the workout FK, so grouping never has to
			// touch the lazy workout association.
			grouped.computeIfAbsent(statistic.getId().getWorkoutId(), k -> new ArrayList<>()).add(statistic);
		}
		return grouped;
	}

	/**
	 * What is already stored for one HealthKit workout, or empty if it is unknown here.
	 * <p>
	 * Lets a client skip an upload it does not need to make — after a reinstall, or during a
	 * backfill where most of the history is already current.
	 *
	 * <p>{@code receivedChunks} is counted rather than read off the workout row, because
	 * {@code expected_chunks} records what the last upload <em>claimed</em> the track would be. The
	 * two diverge precisely when a track upload was interrupted, which is the case a caller most
	 * needs to tell apart from a complete one.
	 */
	public Optional<WorkoutManifestResponse> getManifest(final UUID healthkitUuid) {
		return workoutDao.findByHealthkitUuid(healthkitUuid)
						.map(workout -> WorkoutManifestResponse.builder()
										.id(workout.getId())
										.healthkitUuid(workout.getHealthkitUuid())
										.contentHash(workout.getContentHash())
										.extractionVersion(workout.getExtractionVersion())
										.trackStatus(workout.getTrackStatus())
										.expectedChunks(workout.getExpectedChunks())
										.receivedChunks(trackChunkRepository.countByWorkoutId(workout.getId()))
										.routePointCount(workout.getRoutePointCount())
										.build());
	}

	public WorkoutEntity createWorkout(final CreateWorkoutRequest request) {
		final WorkoutEntity workout = workoutMapper.toEntity(request);
		final List<WorkoutStatisticEntity> statistics = toStatisticEntities(request.statistics());
		final List<WorkoutEventEntity> events = toEventEntities(request.events());
		return workoutDao.upsert(workout, statistics, events);
	}

	/**
	 * Store one track chunk (route + series + events) for a workout and return it.
	 */
	public TrackChunkEntity saveTrackChunk(final UUID workoutId, final TrackChunkRequest request) {
		final TrackChunkEntity chunk = trackMapper.toChunkEntity(request);
		final List<RoutePointEntity> routePoints = toRoutePointEntities(request);
		final List<SeriesPointEntity> seriesPoints = toSeriesPointEntities(request);
		final List<WorkoutEventEntity> events = toEventEntities(request.events());
		return trackDao.saveChunk(workoutId, chunk, routePoints, seriesPoints, events);
	}

	private List<WorkoutStatisticEntity> toStatisticEntities(final Map<String, StatisticSummary> statistics) {
		final List<WorkoutStatisticEntity> entities = new ArrayList<>();
		if (statistics == null) {
			return entities;
		}
		statistics.forEach((name, summary) -> {
			final WorkoutStatisticEntity entity = workoutMapper.toStatisticEntity(summary);
			entity.setId(new WorkoutStatisticId(null, name));
			entities.add(entity);
		});
		return entities;
	}

	private List<WorkoutEventEntity> toEventEntities(final List<WorkoutEvent> events) {
		final List<WorkoutEventEntity> entities = new ArrayList<>();
		if (events == null) {
			return entities;
		}
		events.forEach(event -> entities.add(workoutMapper.toEventEntity(event)));
		return entities;
	}

	private List<RoutePointEntity> toRoutePointEntities(final TrackChunkRequest request) {
		final List<RoutePointEntity> entities = new ArrayList<>();
		if (request.route() == null) {
			return entities;
		}
		request.route().forEach(point -> entities.add(trackMapper.toRoutePointEntity(point)));
		return entities;
	}

	private List<SeriesPointEntity> toSeriesPointEntities(final TrackChunkRequest request) {
		final List<SeriesPointEntity> entities = new ArrayList<>();
		if (request.series() == null) {
			return entities;
		}
		request.series().forEach((metric, points) -> {
			if (points == null) {
				return;
			}
			for (final SeriesPoint point : points) {
				final SeriesPointEntity entity = trackMapper.toSeriesPointEntity(point);
				entity.setMetric(metric);
				entities.add(entity);
			}
		});
		return entities;
	}
}
