package to.charlie.basecamp.domain.service;

import org.junit.jupiter.api.Test;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetDay;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SunsetScorerTest {

	private static final String MODEL = "icon_seamless";
	private static final LocalDate DATE = LocalDate.of(2026, 11, 10);
	private static final long HOUR = 3600;
	private static final int HOURS = 24;
	// Half past the sixteenth hour, so every reading is interpolated between two samples.
	private static final long SUNSET = 16 * HOUR + HOUR / 2;

	private final SunsetScorer scorer = new SunsetScorer();

	@Test
	void brokenHighCloudWithAClearHorizonScoresNearTheTop() {
		final SunsetDay day = score(local(50, 10, 0, 50, 30_000, 0), clearPath());

		assertThat(day.score()).isGreaterThan(9.5);
		assertThat(day.label()).isEqualTo("Excellent");
		assertThat(day.reasons()).isEmpty();
	}

	@Test
	void cloudOnTheSunsPathRuinsAnOtherwisePerfectSky() {
		final SunsetDay day = score(local(50, 10, 0, 50, 30_000, 0), path(100, 0));

		assertThat(day.score()).isLessThan(4);
		assertThat(day.reasons()).containsExactly("cloud blocking the sun's path");
	}

	@Test
	void aCloudlessSkyIsOnlyFair() {
		final SunsetDay day = score(local(0, 0, 0, 50, 30_000, 0), clearPath());

		assertThat(day.score()).isBetween(4.0, 5.0);
		assertThat(day.reasons()).containsExactly("not much high or mid cloud to light up");
	}

	@Test
	void midCloudOnTheSunsPathBlocksAtHalfTheRateOfLow() {
		final SunsetDay day = score(local(50, 10, 0, 50, 30_000, 0), path(0, 80));

		assertThat(day.pathBlocks()).containsOnly(40.0);
	}

	@Test
	void rainThatHasStoppedWithTheCloudBreakingEarnsTheClearingBonus() {
		final Map<String, Object> local = local(50, 10, 20, 50, 30_000, 0);
		// Raining and overcast until three hours before sunset, then dry and opening up.
		set(local, "precipitation", 10, 13, 1.0);
		set(local, "cloud_cover_low", 0, 14, 90);

		assertThat(score(local, clearPath()).bonus()).isEqualTo(0.7);
		assertThat(score(local(50, 10, 20, 50, 30_000, 0), clearPath()).bonus()).isZero();
	}

	@Test
	void aVariableTheModelDoesNotCarryIsLeftOutRatherThanScoredAsPerfect() {
		final Map<String, Object> local = local(50, 10, 0, 95, 30_000, 0);
		set(local, "visibility", 0, HOURS, null);

		final SunsetDay day = score(local, clearPath());

		assertThat(day.visibilityKm()).isNull();
		// Humidity alone now, where good visibility would have pulled the average up.
		assertThat(day.factors().clarity()).isEqualTo(0.55);
	}

	@Test
	void aModelWithNoWeatherForTheSunsetHasNoScore() {
		final Map<String, Object> local = local(0, 0, 0, 0, 0, 0);
		for (final String variable : List.of("cloud_cover_high", "cloud_cover_mid", "cloud_cover_low",
						"relative_humidity_2m", "visibility", "precipitation", "pressure_msl")) {
			set(local, variable, 0, HOURS, null);
		}
		final List<WeatherSeries> noPath = path(0, 0).stream().map(point -> WeatherSeries.of(Map.of("hourly", Map.of("time", times())), MODEL)).toList();

		assertThat(scorer.score(DATE, SUNSET, 240, WeatherSeries.of(local, MODEL), noPath, null)).isEmpty();
	}

	@Test
	void readsAResponseForASingleModelWhereTheVariablesAreNotSuffixed() {
		final Map<String, Object> hourly = new HashMap<>();
		hourly.put("time", times());
		hourly.put("cloud_cover_low", constant(40));

		assertThat(WeatherSeries.of(Map.of("hourly", hourly), MODEL).valueAt("cloud_cover_low", SUNSET)).isEqualTo(40.0);
	}

	private SunsetDay score(final Map<String, Object> local, final List<WeatherSeries> path) {
		return scorer.score(DATE, SUNSET, 240, WeatherSeries.of(local, MODEL), path, null).orElseThrow();
	}

	private static List<WeatherSeries> clearPath() {
		return path(0, 0);
	}

	private static List<WeatherSeries> path(final double low, final double mid) {
		final Map<String, Object> hourly = new HashMap<>();
		hourly.put("time", times());
		hourly.put("cloud_cover_low_" + MODEL, constant(low));
		hourly.put("cloud_cover_mid_" + MODEL, constant(mid));
		return Collections.nCopies(SunsetScorer.PATH_POINTS_KM.size(), WeatherSeries.of(Map.of("hourly", hourly), MODEL));
	}

	/** A day of unchanging weather, in the shape Open-Meteo answers with for several models. */
	private static Map<String, Object> local(final double high, final double mid, final double low,
	                                         final double humidity, final double visibility, final double rain) {
		final Map<String, Object> hourly = new HashMap<>();
		hourly.put("time", times());
		hourly.put("cloud_cover_high_" + MODEL, constant(high));
		hourly.put("cloud_cover_mid_" + MODEL, constant(mid));
		hourly.put("cloud_cover_low_" + MODEL, constant(low));
		hourly.put("relative_humidity_2m_" + MODEL, constant(humidity));
		hourly.put("visibility_" + MODEL, constant(visibility));
		hourly.put("precipitation_" + MODEL, constant(rain));
		hourly.put("pressure_msl_" + MODEL, constant(1010));
		return Map.of("hourly", hourly);
	}

	@SuppressWarnings("unchecked")
	private static void set(final Map<String, Object> local, final String variable, final int from, final int to, final Number value) {
		final List<Number> values = (List<Number>) ((Map<String, Object>) local.get("hourly")).get(variable + "_" + MODEL);
		for (int hour = from; hour < to; hour++) {
			values.set(hour, value);
		}
	}

	private static List<Number> times() {
		final List<Number> times = new ArrayList<>();
		for (int hour = 0; hour < HOURS; hour++) {
			times.add(hour * HOUR);
		}
		return times;
	}

	private static List<Number> constant(final double value) {
		return new ArrayList<>(Collections.nCopies(HOURS, value));
	}
}
