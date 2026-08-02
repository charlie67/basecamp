package to.charlie.basecamp.infrastructure.dal.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WorkoutRepository extends JpaRepository<WorkoutEntity, UUID> {

	Optional<WorkoutEntity> findByHealthkitUuid(UUID healthkitUuid);

	Page<WorkoutEntity> findAllByOrderByEndDateDesc(Pageable pageable);

	boolean existsByHealthkitUuid(UUID healthkitUuid);

	/**
	 * Natural-key lookup: a workout of a given type cannot start at two instants, so
	 * {@code (type, start_date)} identifies the same workout even under a fresh HealthKit uuid.
	 */
	Optional<WorkoutEntity> findByTypeAndStartDate(String type, Instant startDate);

	/**
	 * Listing filtered by an optional start-date range and an optional map viewport.
	 * Every filter is independently optional: a null bound simply drops that predicate.
	 *
	 * <p>The viewport test asks whether any of the workout's route actually passes through the
	 * box, rather than comparing precomputed extents — a track spanning the view without
	 * entering it is correctly excluded. It is native because {@code point <@ box} has no JPQL
	 * equivalent; {@code idx_route_point_geo} (a core-Postgres GiST index, no PostGIS) is what
	 * keeps the EXISTS cheap.
	 *
	 * <p>Every nullable bind is wrapped in an explicit cast because Postgres cannot infer a type
	 * for a bare NULL parameter. The ordering is inline rather than carried on the Pageable:
	 * Spring Data appends limit/offset to a native query but will not rewrite its ORDER BY, so
	 * callers must pass an unsorted Pageable.
	 */
	@Query(value = """
					select w.* from workout w
					where (cast(:fromDate as timestamptz) is null or w.start_date >= cast(:fromDate as timestamptz))
					  and (cast(:toDate as timestamptz) is null or w.start_date < cast(:toDate as timestamptz))
					  and (cast(:minLat as double precision) is null or exists (
					        select 1 from route_point rp
					        where rp.workout_id = w.id
					          and point(rp.lon, rp.lat) <@ box(
					                point(cast(:minLon as double precision), cast(:minLat as double precision)),
					                point(cast(:maxLon as double precision), cast(:maxLat as double precision)))))
					order by w.end_date desc
					""",
					countQuery = """
									select count(*) from workout w
									where (cast(:fromDate as timestamptz) is null or w.start_date >= cast(:fromDate as timestamptz))
									  and (cast(:toDate as timestamptz) is null or w.start_date < cast(:toDate as timestamptz))
									  and (cast(:minLat as double precision) is null or exists (
									        select 1 from route_point rp
									        where rp.workout_id = w.id
									          and point(rp.lon, rp.lat) <@ box(
									                point(cast(:minLon as double precision), cast(:minLat as double precision)),
									                point(cast(:maxLon as double precision), cast(:maxLat as double precision)))))
									""",
					nativeQuery = true)
	List<WorkoutEntity> search(@Param("fromDate") Instant fromDate,
	                           @Param("toDate") Instant toDate,
	                           @Param("minLat") Double minLat,
	                           @Param("maxLat") Double maxLat,
	                           @Param("minLon") Double minLon,
	                           @Param("maxLon") Double maxLon);
}
