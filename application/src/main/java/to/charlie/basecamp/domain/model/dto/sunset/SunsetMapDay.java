package to.charlie.basecamp.domain.model.dto.sunset;

import java.time.LocalDate;
import java.util.List;

/**
 * One evening's scores across the map.
 *
 * @param date             the local day at the middle of the map
 * @param sunset           unix seconds of the sunset there, to say roughly when the scores are for
 * @param utcOffsetSeconds that point's own offset from UTC, for showing the time as its clocks will
 * @param scores           0 to 10 for every lattice point, row by row from the south-west corner;
 *                         null where there is no sunset or no weather to score
 */
public record SunsetMapDay(
				LocalDate date,
				long sunset,
				int utcOffsetSeconds,
				List<Double> scores
) {}
