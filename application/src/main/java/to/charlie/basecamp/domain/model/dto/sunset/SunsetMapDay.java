package to.charlie.basecamp.domain.model.dto.sunset;

import java.time.LocalDate;
import java.util.List;

/**
 * One day's sunset or sunrise scored across the map.
 *
 * @param date             the local day at the middle of the map
 * @param time             unix seconds of the sunset or sunrise there, to say roughly when the scores are for
 * @param utcOffsetSeconds that point's own offset from UTC, for showing the time as its clocks will
 * @param scores           0 to 10 for every lattice point, row by row from the south-west corner;
 *                         null where the sun does not set or rise, or there is no weather to score
 */
public record SunsetMapDay(
				LocalDate date,
				long time,
				int utcOffsetSeconds,
				List<Double> scores
) {}
