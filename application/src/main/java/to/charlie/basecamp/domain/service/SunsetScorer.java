package to.charlie.basecamp.domain.service;

import org.springframework.stereotype.Component;
import to.charlie.basecamp.domain.model.SunEvent;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetDay;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetFactors;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Scores one sunset or sunrise out of ten from the weather forecast for it. The two are judged
 * alike: the same sky makes either, lit from the other side.
 *
 * <p>A good sunset needs mid and high cloud overhead to catch the light, and a clear path toward
 * the setting sun for that light to arrive by. Most dull ones fail one of the two, so those
 * carry the weight; air clarity and rain adjust the rest.
 */
@Component
public class SunsetScorer {

	/**
	 * Distances along the sunset bearing to check for light-blocking cloud. Light reaching high
	 * cloud overhead skims the ground a few hundred kilometres away, so the middle distances
	 * count for most.
	 */
	public static final List<Integer> PATH_POINTS_KM = List.of(50, 100, 200, 300);
	private static final double[] PATH_WEIGHTS = {1.0, 1.5, 1.5, 1.0};

	// Weights for a weighted geometric mean, so that any factor near zero drags the whole score
	// down: a blocked horizon ruins even a perfect canvas of cloud.
	private static final double CANVAS_WEIGHT = 0.35;
	private static final double LOCAL_LOW_WEIGHT = 0.20;
	private static final double HORIZON_WEIGHT = 0.25;
	private static final double CLARITY_WEIGHT = 0.15;
	private static final double RAIN_WEIGHT = 0.05;

	private static final double CLEARING_BONUS = 0.7;
	// Rise over six hours that marks a front clearing.
	private static final double PRESSURE_RISE_HPA = 2.0;

	private static final long HOUR = 3600;

	/**
	 * @param path     cloud at each of {@link #PATH_POINTS_KM} toward the sun, nearest first
	 * @param aerosols null when there is no air quality forecast
	 * @param time     unix seconds of the sunset or sunrise
	 * @return empty when the model has nothing at all for it
	 */
	public Optional<SunsetDay> score(final SunEvent event, final LocalDate date, final long time, final double azimuth,
	                                 final WeatherSeries local, final List<WeatherSeries> path,
	                                 final WeatherSeries aerosols) {

		final Double high = local.valueAt("cloud_cover_high", time);
		final Double mid = local.valueAt("cloud_cover_mid", time);
		final Double low = local.valueAt("cloud_cover_low", time);
		final Double humidity = local.valueAt("relative_humidity_2m", time);
		final Double visibility = local.valueAt("visibility", time);
		final Double visibilityKm = visibility == null ? null : visibility / 1000;
		final Double rain = local.valueAt("precipitation", time);
		final Double aerosol = aerosols == null ? null : aerosols.valueAt("aerosol_optical_depth", time);
		final Double pressureNow = local.valueAt("pressure_msl", time);
		final Double pressureBefore = local.valueAt("pressure_msl", time - 6 * HOUR);
		final Double pressureChange = pressureNow == null || pressureBefore == null ? null : pressureNow - pressureBefore;

		Double canvas = null;
		if (high != null && mid != null) {
			// Chance of a given patch of sky having high or mid cloud, assuming random overlap.
			final double cover = 100 * (1 - (1 - high / 100) * (1 - mid / 100));
			canvas = ramp(cover, 0, 0.1, 30, 1, 70, 1, 100, 0.3);
			// Thick altostratus tends to be a grey lid.
			if (mid > 80) {
				canvas *= 0.7;
			}
		}

		final Double localLow = low == null ? null : ramp(low, 15, 1, 85, 0.01);

		final List<Double> pathBlocks = new ArrayList<>();
		double blocked = 0;
		double blockedWeight = 0;
		for (int i = 0; i < path.size(); i++) {
			final Double pathLow = path.get(i).valueAt("cloud_cover_low", time);
			if (pathLow == null) {
				pathBlocks.add(null);
				continue;
			}
			// Thick mid cloud on the sun's path blocks light too, at half the rate of low.
			final Double pathMid = path.get(i).valueAt("cloud_cover_mid", time);
			final double block = Math.max(pathLow, 0.5 * (pathMid == null ? 0 : pathMid));
			pathBlocks.add(block);
			blocked += block * PATH_WEIGHTS[i];
			blockedWeight += PATH_WEIGHTS[i];
		}
		final Double horizon = blockedWeight == 0 ? null : ramp(blocked / blockedWeight, 10, 1, 80, 0.01);

		final List<Double> clarityParts = new ArrayList<>();
		if (humidity != null) {
			clarityParts.add(ramp(humidity, 55, 1, 95, 0.55));
		}
		if (visibilityKm != null) {
			clarityParts.add(ramp(visibilityKm, 5, 0.55, 20, 1));
		}
		if (aerosol != null) {
			clarityParts.add(ramp(aerosol, 0.15, 1, 0.5, 0.6, 1, 0.4));
		}
		final Double clarity = clarityParts.isEmpty()
						? null
						: clarityParts.stream().mapToDouble(Double::doubleValue).average().orElseThrow();

		final Double rainFactor = rain == null ? null : ramp(rain, 0, 1, 0.2, 0.7, 2, 0.1);

		final double[][] weighted = {
						{CANVAS_WEIGHT, orNaN(canvas)},
						{LOCAL_LOW_WEIGHT, orNaN(localLow)},
						{HORIZON_WEIGHT, orNaN(horizon)},
						{CLARITY_WEIGHT, orNaN(clarity)},
						{RAIN_WEIGHT, orNaN(rainFactor)},
		};
		// Renormalised over the factors there are, so a missing one does not count as perfect.
		double totalWeight = 0;
		for (final double[] factor : weighted) {
			if (!Double.isNaN(factor[1])) {
				totalWeight += factor[0];
			}
		}
		if (totalWeight == 0) {
			return Optional.empty();
		}
		double score = 10;
		for (final double[] factor : weighted) {
			if (!Double.isNaN(factor[1])) {
				score *= Math.pow(factor[1], factor[0] / totalWeight);
			}
		}

		// The classic clearing-storm sunset: rain has washed the air and the front is moving off,
		// shown by low cloud breaking up or by pressure rising behind it.
		double bonus = 0;
		final double rainBefore = local.totalBetween("precipitation", time - 6 * HOUR, time - HOUR / 2);
		if (rainBefore >= 1 && (rain == null || rain < 0.1) && low != null) {
			final Double lowBefore = local.valueAt("cloud_cover_low", time - 3 * HOUR);
			final boolean cloudBreaking = lowBefore != null && lowBefore - low >= 15;
			final boolean pressureRising = pressureChange != null && pressureChange >= PRESSURE_RISE_HPA && low < 50;
			if (cloudBreaking || pressureRising) {
				bonus = CLEARING_BONUS;
			}
		}
		score = Math.min(10, score + bonus);

		final List<String> reasons = new ArrayList<>();
		if (horizon != null && horizon < 0.7) {
			reasons.add("cloud blocking the sun's path");
		}
		if (localLow != null && localLow < 0.7) {
			reasons.add("low cloud overhead");
		}
		if (canvas != null && canvas < 0.7) {
			reasons.add(high + mid < 60 ? "not much high or mid cloud to light up" : "cloud too thick overhead");
		}
		if (clarity != null && clarity < 0.75) {
			reasons.add("hazy or humid air");
		}
		if (rainFactor != null && rainFactor < 0.7) {
			reasons.add("rain at " + event.variable());
		}

		return Optional.of(new SunsetDay(
						date, time, azimuth, score, label(score),
						new SunsetFactors(canvas, localLow, horizon, clarity, rainFactor),
						bonus, reasons, high, mid, low, pathBlocks,
						humidity, visibilityKm, aerosol, rain, pressureChange));
	}

	/** Judged against the score rounded to one decimal place, as that is the number shown beside it. */
	private static String label(final double score) {
		final double shown = Math.round(score * 10) / 10.0;
		if (shown >= 8) {
			return "Excellent";
		}
		if (shown >= 6.5) {
			return "Good";
		}
		if (shown >= 4.5) {
			return "Fair";
		}
		if (shown >= 2.5) {
			return "Poor";
		}
		return "Dull";
	}

	private static double orNaN(final Double value) {
		return value == null ? Double.NaN : value;
	}

	/**
	 * Piecewise-linear interpolation, clamped at the ends.
	 *
	 * @param points x then y for each point, in ascending x
	 */
	private static double ramp(final double x, final double... points) {
		if (x <= points[0]) {
			return points[1];
		}
		for (int i = 2; i < points.length; i += 2) {
			if (x <= points[i]) {
				final double x0 = points[i - 2];
				final double y0 = points[i - 1];
				return y0 + (points[i + 1] - y0) * (x - x0) / (points[i] - x0);
			}
		}
		return points[points.length - 1];
	}
}
