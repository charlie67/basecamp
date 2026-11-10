package to.charlie.basecamp.domain.model.dto.sunset;

import java.time.Instant;
import java.util.List;

/**
 * @param lat              centre of the grid cell the forecast is for, which is close to but
 *                         not exactly the point asked about
 * @param utcOffsetSeconds the cell's own offset from UTC, for showing sunset times as its
 *                         clocks will
 * @param fetchedAt        when the weather behind the scores was fetched
 * @param pathPointsKm     the distances toward the sun that each day's {@code pathBlocks} are at
 * @param models           one entry per configured weather model, in configured order
 */
public record SunsetForecastResponse(
				double lat,
				double lon,
				int utcOffsetSeconds,
				Instant fetchedAt,
				List<Integer> pathPointsKm,
				List<SunsetModelForecast> models
) {}
