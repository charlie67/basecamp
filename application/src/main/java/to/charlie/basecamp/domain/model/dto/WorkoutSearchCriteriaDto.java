package to.charlie.basecamp.domain.model.dto;

import java.time.Instant;

/**
 * Filters for the workout search: an optional start-date range and an optional map viewport.
 * Any field may be null, which drops that predicate.
 */
public record WorkoutSearchCriteriaDto(Instant from,
                                       Instant to,
                                       Double minLat,
                                       Double maxLat,
                                       Double minLon,
                                       Double maxLon) {

	/**
	 * Normalises raw request values into criteria the query can trust.
	 *
	 * <p>The viewport is all-or-nothing: a partially supplied box is dropped rather than guessed
	 * at, so a malformed request degrades to a date-only search instead of silently matching a
	 * half-open area. A box whose longitudes are inverted has crossed the antimeridian, which
	 * {@code box()} cannot express — it normalises the corners and would quietly search the
	 * complementary strip of the globe, so that is dropped too.
	 */
	public static WorkoutSearchCriteriaDto of(final Instant from,
	                                          final Instant to,
	                                          final Double minLat,
	                                          final Double maxLat,
	                                          final Double minLon,
	                                          final Double maxLon) {
		final boolean complete = minLat != null && maxLat != null && minLon != null && maxLon != null;
		if (!complete || minLon > maxLon) {
			return new WorkoutSearchCriteriaDto(from, to, null, null, null, null);
		}
		return new WorkoutSearchCriteriaDto(from, to, minLat, maxLat, minLon, maxLon);
	}
}
