package to.charlie.basecamp.domain.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import to.charlie.basecamp.domain.model.dto.WorkoutSearchCriteriaDto;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutRequest;
import to.charlie.basecamp.domain.model.dto.workout.RoutePoint;
import to.charlie.basecamp.domain.model.dto.workout.SeriesPoint;
import to.charlie.basecamp.domain.model.dto.workout.StatisticSummary;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkRequest;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutEvent;
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
import to.charlie.basecamp.infrastructure.dal.repository.WorkoutStatisticRepository;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Application service for HealthKit workout ingest: maps the REST DTOs onto the
 * persistence model and delegates the upsert / chunk-append flows to the DAOs.
 */
@Service
@RequiredArgsConstructor
public class WorkoutService {

	/**
	 * Route points are thinned before they go on the wire — the map does not need every fix.
	 * Applied in the database rather than after loading, so the discarded fixes are never read.
	 */
	private static final int ROUTE_POINT_STRIDE = 20;

	private final WorkoutMapper workoutMapper;
	private final TrackMapper trackMapper;
	private final WorkoutDao workoutDao;
	private final TrackDao trackDao;
	private final RoutePointRepository routePointRepository;
	private final WorkoutStatisticRepository workoutStatisticRepository;

	public Page<WorkoutEntity> getWorkouts(final Pageable pageable) {
		return workoutDao.findAllOrdered(pageable);
	}

	public Page<WorkoutEntity> searchWorkouts(final WorkoutSearchCriteriaDto criteria, final Pageable pageable) {
		return workoutDao.search(criteria, pageable);
	}

	/**
	 * The map's polylines for a page of workouts, already thinned to every
	 * {@link #ROUTE_POINT_STRIDE}-th fix and grouped by workout.
	 */
	public Map<UUID, List<RoutePoint>> getRoutePointsByWorkoutIds(final Collection<UUID> workoutIds) {
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

	public Map<UUID, List<WorkoutStatisticEntity>> getStatisticsByWorkoutIds(final Collection<UUID> workoutIds) {
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
