package to.charlie.basecamp.domain.model.dto.sunset;

/**
 * The parts a sunset score is made from, each between 0 and 1. One is null when the model had
 * nothing to score it from, which is not the same as scoring it badly.
 *
 * @param canvas   mid and high cloud overhead to catch the light
 * @param localLow low cloud overhead, which blocks it
 * @param horizon  cloud along the path the light arrives by
 * @param clarity  humidity, visibility and aerosols
 * @param rain     rain at sunset
 */
public record SunsetFactors(
				Double canvas,
				Double localLow,
				Double horizon,
				Double clarity,
				Double rain
) {}
