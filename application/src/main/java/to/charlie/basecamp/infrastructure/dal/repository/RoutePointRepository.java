package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.RoutePointEntity;
import to.charlie.basecamp.infrastructure.dal.projection.RoutePointProjection;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface RoutePointRepository extends JpaRepository<RoutePointEntity, Long> {

	void deleteByChunkId(UUID chunkId);

	long countByWorkoutId(UUID workoutId);

	/**
	 * Every {@code stride}-th fix of each given workout, oldest first, for the map's polylines.
	 *
	 * <p>The thinning is a window function rather than a loop over a fully loaded page because
	 * the discarded fixes are the overwhelming majority — a page of twenty workouts can hold a
	 * couple of hundred thousand of them and keep one in twenty. Selecting them only to drop them
	 * costs a wire transfer and an entity hydration each.
	 *
	 * <p>{@code mod(rn - 1, stride)} keeps the numbering zero-based so the first fix of every
	 * workout always survives, matching what an index-stepping loop would have taken.
	 *
	 * <p>The window is ordered on {@code t} alone. Repeated timestamps do occur in imported
	 * tracks, so which of a tied group survives is not guaranteed — but adding {@code id} as a
	 * tiebreaker measured about five times slower here, because the sort can then no longer be fed
	 * in {@code idx_route_point_workout_t} order. Tied fixes are a metre or so apart and the
	 * result is a thinned polyline either way, which is not worth that.
	 *
	 * <p>Native because JPQL has no window functions. The aliases are quoted to survive Postgres'
	 * lower-casing, which is what lets the projection bind by property name.
	 */
	@Query(value = """
					select workout_id             as "workoutId",
					       t                      as "t",
					       lat                    as "lat",
					       lon                    as "lon",
					       altitude_m             as "altitudeM",
					       ellipsoidal_altitude_m as "ellipsoidalAltitudeM",
					       horizontal_accuracy_m  as "horizontalAccuracyM",
					       vertical_accuracy_m    as "verticalAccuracyM",
					       speed_mps              as "speedMps",
					       speed_accuracy_mps     as "speedAccuracyMps",
					       course_deg             as "courseDeg",
					       course_accuracy_deg    as "courseAccuracyDeg"
					from (select rp.workout_id,
					             rp.t,
					             rp.lat,
					             rp.lon,
					             rp.altitude_m,
					             rp.ellipsoidal_altitude_m,
					             rp.horizontal_accuracy_m,
					             rp.vertical_accuracy_m,
					             rp.speed_mps,
					             rp.speed_accuracy_mps,
					             rp.course_deg,
					             rp.course_accuracy_deg,
					             row_number() over (partition by rp.workout_id order by rp.t) as rn
					      from route_point rp
					      where rp.workout_id in (:workoutIds)) numbered
					where mod(rn - 1, :stride) = 0
					order by "workoutId", "t"
					""",
					nativeQuery = true)
	List<RoutePointProjection> findThinnedByWorkoutIds(@Param("workoutIds") Collection<UUID> workoutIds,
	                                                   @Param("stride") int stride);
}
