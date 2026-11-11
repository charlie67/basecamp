package to.charlie.basecamp.domain.model.dto.sunset;

import java.time.LocalDate;
import java.util.List;

/**
 * One model's score for one sunset or sunrise, with the weather it was worked out from.
 *
 * @param date           the local day, which is what lines the same sunset up across models:
 *                       each places the sunset itself a few seconds differently
 * @param time           unix seconds of the sunset or sunrise
 * @param azimuth        compass bearing of the sun as it sets or rises, degrees from north
 * @param score          0 to 10
 * @param bonus          added for a clearing storm, already included in {@code score}
 * @param reasons        what held the score back, in words; empty when nothing did
 * @param high           cloud cover overhead at sunset, percent, as are {@code mid} and {@code low}
 * @param pathBlocks     light-blocking cloud, percent, at each point toward the sun
 * @param rain           mm/h at sunset
 * @param pressureChange hPa over the six hours before sunset
 */
public record SunsetDay(
				LocalDate date,
				long time,
				double azimuth,
				double score,
				String label,
				SunsetFactors factors,
				double bonus,
				List<String> reasons,
				Double high,
				Double mid,
				Double low,
				List<Double> pathBlocks,
				Double humidity,
				Double visibilityKm,
				Double aerosol,
				Double rain,
				Double pressureChange
) {}
