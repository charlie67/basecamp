package to.charlie.basecamp.infrastructure.dal.projection;

import java.time.Instant;
import java.util.UUID;

/**
 * A route point read straight onto the wire shape, bypassing {@code RoutePointEntity}.
 *
 * <p>A  workouts can cover a few hundred thousand fixes, of which the response keeps
 * one in {@code ROUTE_POINT_STRIDE}. Hydrating those as managed entities — persistence-context
 * bookkeeping, lazy proxies for {@code workout} and {@code chunk} — costs far more than the rows
 * are worth when the thinning has already happened in the database. The surrogate {@code id} and
 * {@code chunk_id} are left behind for the same reason: nothing downstream reads them.
 *
 * <p>{@code workoutId} is carried only so the caller can group the flat result back per workout.
 */
public interface RoutePointProjection {

	UUID getWorkoutId();

	Instant getT();

	double getLat();

	double getLon();

	double getAltitudeM();

	double getEllipsoidalAltitudeM();

	double getHorizontalAccuracyM();

	double getVerticalAccuracyM();

	double getSpeedMps();

	double getSpeedAccuracyMps();

	double getCourseDeg();

	double getCourseAccuracyDeg();
}
