package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.SeriesPointEntity;
import to.charlie.basecamp.infrastructure.dal.projection.MetricSampleProjection;

import java.util.List;
import java.util.UUID;

@Repository
public interface SeriesPointRepository extends JpaRepository<SeriesPointEntity, Long> {

	void deleteByChunkId(UUID chunkId);

	long countByWorkoutId(UUID workoutId);

	/**
	 * One metric's samples for a single workout, oldest first, thinned to at most roughly
	 * {@code maxSamples}.
	 *
	 * <p>Unlike the route points' fixed stride, the stride here is derived from the count, because
	 * sampling cadence is the watch's business and varies by an order of magnitude between
	 * workouts: a fixed stride would return four points for one walk and four thousand for the
	 * next. Dividing by the cap instead means a chart-sized answer either way.
	 *
	 * <p>Integer division rounds the stride down, so the result can overshoot the cap by up to
	 * (roughly) a factor of two — 999 samples capped at 500 gives a stride of 1 and all 999 back.
	 * Tightening that would need a fractional stride and a rounding rule per row; the cap exists to
	 * stop a chart being sent a hundred thousand points, and being handed 999 instead of 500 does
	 * not threaten that.
	 *
	 * <p>{@code mod(rn - 1, stride)} keeps the numbering zero-based so the first sample always
	 * survives, and {@code greatest} guards the stride against zero when there are fewer samples
	 * than the cap.
	 *
	 * <p>Native because JPQL has no window functions. The aliases are quoted to survive Postgres'
	 * lower-casing, which is what lets the projection bind by property name.
	 */
	@Query(value = """
					select "t", "e", "value"
					from (select sp.start_at                                  as "t",
					             sp.end_at                                    as "e",
					             sp.value                                     as "value",
					             row_number() over (order by sp.start_at)     as rn,
					             count(*) over ()                             as total
					      from series_point sp
					      where sp.workout_id = :workoutId
					        and sp.metric = :metric) numbered
					where mod(rn - 1, greatest(1, total / :maxSamples)) = 0
					order by "t"
					""",
					nativeQuery = true)
	List<MetricSampleProjection> findThinnedByWorkoutIdAndMetric(@Param("workoutId") UUID workoutId,
	                                                             @Param("metric") String metric,
	                                                             @Param("maxSamples") int maxSamples);
}
