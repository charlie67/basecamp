package to.charlie.basecamp.domain.model.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import to.charlie.basecamp.domain.model.dto.workout.RoutePoint;
import to.charlie.basecamp.domain.model.dto.workout.SeriesPoint;
import to.charlie.basecamp.domain.model.dto.workout.TrackChunkRequest;
import to.charlie.basecamp.domain.model.entity.RoutePointEntity;
import to.charlie.basecamp.domain.model.entity.SeriesPointEntity;
import to.charlie.basecamp.domain.model.entity.TrackChunkEntity;
import to.charlie.basecamp.infrastructure.dal.projection.RoutePointProjection;

/**
 * Maps the {@code POST /workouts/{id}/track} chunk DTO and its time-series payloads
 * onto their entities. Associations ({@code workout}, {@code chunk}), generated ids
 * and the {@code metric} name (a {@code series} map key) are wired up by the DAO/service.
 */
@Mapper(componentModel = "spring")
public interface TrackMapper {

	@Mapping(target = "id", ignore = true)
	@Mapping(target = "workout", ignore = true)
	@Mapping(target = "receivedAt", ignore = true)
	@Mapping(target = "startAt", source = "start")
	@Mapping(target = "endAt", source = "end")
	TrackChunkEntity toChunkEntity(TrackChunkRequest request);

	@Mapping(target = "id", ignore = true)
	@Mapping(target = "workout", ignore = true)
	@Mapping(target = "chunk", ignore = true)
	RoutePointEntity toRoutePointEntity(RoutePoint routePoint);

	RoutePoint toRoutePoint(RoutePointEntity entity);

	/**
	 * {@code workoutId} rides along on the projection purely as a grouping key and has no
	 * counterpart on the wire DTO, so it is dropped here rather than mapped.
	 */
	RoutePoint toRoutePoint(RoutePointProjection projection);

	@Mapping(target = "id", ignore = true)
	@Mapping(target = "workout", ignore = true)
	@Mapping(target = "chunk", ignore = true)
	@Mapping(target = "metric", ignore = true)
	@Mapping(target = "startAt", source = "start")
	@Mapping(target = "endAt", source = "end")
	SeriesPointEntity toSeriesPointEntity(SeriesPoint seriesPoint);
}
