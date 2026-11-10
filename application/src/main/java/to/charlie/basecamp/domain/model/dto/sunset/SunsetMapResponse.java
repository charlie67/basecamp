package to.charlie.basecamp.domain.model.dto.sunset;

import java.time.Instant;
import java.util.List;

/**
 * Sunset scores on a regular lattice covering the area asked about.
 *
 * @param south     latitude of the first row, which is at or below the area's southern edge
 * @param west      longitude of the first column, at or beyond its western edge
 * @param latStep   degrees between rows
 * @param lonStep   degrees between columns
 * @param model     the one weather model the lattice is scored against
 * @param fetchedAt when the oldest weather behind the scores was fetched
 * @param days      in order from today; a day nothing could be scored for is left out
 */
public record SunsetMapResponse(
				double south,
				double west,
				double latStep,
				double lonStep,
				int rows,
				int cols,
				String model,
				Instant fetchedAt,
				List<SunsetMapDay> days
) {}
