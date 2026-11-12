package to.charlie.basecamp.domain.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import to.charlie.basecamp.configuration.SunsetProperties;
import to.charlie.basecamp.domain.model.SunEvent;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetMapResponse;
import to.charlie.basecamp.domain.model.entity.SunsetMapPointId;
import to.charlie.basecamp.domain.model.entity.SunsetMapWeatherEntity;
import to.charlie.basecamp.infrastructure.dal.repository.SunsetMapWeatherRepository;
import to.charlie.basecamp.infrastructure.rest.client.OpenMeteoApiClient;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.ToDoubleFunction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SunsetMapServiceTest {

	private static final String MODEL = "ukmo_seamless";
	private static final long HOUR = 3600;
	private static final long MIDNIGHT = LocalDate.now(ZoneOffset.UTC).atStartOfDay().toEpochSecond(ZoneOffset.UTC);

	private final OpenMeteoApiClient client = mock(OpenMeteoApiClient.class);
	private final SunsetMapWeatherRepository repository = mock(SunsetMapWeatherRepository.class);
	private final SunsetProperties properties = new SunsetProperties();
	private final SunsetMapService service = new SunsetMapService(client, repository, new SunsetScorer(), properties, new SimpleMeterRegistry());

	// What the repository holds, and every point Open-Meteo has been asked for.
	private final Map<SunsetMapPointId, SunsetMapWeatherEntity> cache = new HashMap<>();
	private final List<double[]> asked = new ArrayList<>();
	// Low cloud at a point, by its longitude. Clear everywhere unless a test says otherwise.
	private ToDoubleFunction<Double> lowCloudAtLon = lon -> 0;

	@BeforeEach
	@SuppressWarnings("unchecked")
	void setUp() {
		when(repository.findAllById(any())).thenAnswer(call -> {
			final List<SunsetMapWeatherEntity> found = new ArrayList<>();
			((Iterable<SunsetMapPointId>) call.getArgument(0)).forEach(id -> found.add(cache.get(id)));
			return found.stream().filter(Objects::nonNull).toList();
		});
		when(repository.saveAll(anyList())).thenAnswer(call -> {
			final List<SunsetMapWeatherEntity> saved = call.getArgument(0);
			saved.forEach(entity -> cache.put(entity.getId(), entity));
			return saved;
		});
		when(client.getForecasts(anyList(), eq(MODEL), anyInt())).thenAnswer(call -> {
			final List<double[]> points = call.getArgument(0);
			asked.addAll(points);
			return points.stream().map(point -> forecast(lowCloudAtLon.applyAsDouble(point[1]))).toList();
		});
	}

	@Test
	void scoresEveryPointOfALatticeThatReachesTheEdgesOfTheArea() {
		final SunsetMapResponse map = service.getMap(SunEvent.SUNSET, 51.03, -2.95, 51.38, -2.3);

		// Tenth-of-a-degree rows, and columns twice as far apart.
		assertThat(map.south()).isEqualTo(51.0);
		assertThat(map.west()).isEqualTo(-3.0);
		assertThat(map.latStep()).isEqualTo(0.1);
		assertThat(map.lonStep()).isEqualTo(0.2);
		assertThat(map.rows()).isEqualTo(5);
		assertThat(map.cols()).isEqualTo(5);
		assertThat(map.model()).isEqualTo(MODEL);

		assertThat(map.days()).hasSize(3);
		assertThat(map.days().getFirst().date()).isEqualTo(LocalDate.now(ZoneOffset.UTC));
		assertThat(map.days().getFirst().time()).isEqualTo(MIDNIGHT + 16 * HOUR + HOUR / 2);
		assertThat(map.days()).allSatisfy(day ->
						assertThat(day.scores()).hasSize(25).allSatisfy(score -> assertThat(score).isGreaterThan(9.5)));
	}

	@Test
	void cloudBeyondTheAreaTowardTheSunLowersTheScores() {
		// Overcast well to the west: nothing over the area itself, but across the far end of
		// every path the light arrives by.
		lowCloudAtLon = lon -> lon <= -5 ? 100 : 0;

		final SunsetMapResponse map = service.getMap(SunEvent.SUNSET, 51.03, -2.95, 51.38, -2.3);

		assertThat(map.days().getFirst().scores()).allSatisfy(score -> assertThat(score).isBetween(1.0, 9.0));
		assertThat(asked).anySatisfy(point -> assertThat(point[1]).isLessThanOrEqualTo(-5));
	}

	@Test
	void theSunriseIsLitFromTheEastSoCloudToTheWestDoesNotTouchIt() {
		lowCloudAtLon = lon -> lon <= -5 ? 100 : 0;

		final SunsetMapResponse sunrise = service.getMap(SunEvent.SUNRISE, 51.03, -2.95, 51.38, -2.3);

		assertThat(sunrise.days().getFirst().time()).isEqualTo(MIDNIGHT + 7 * HOUR + HOUR / 2);
		assertThat(sunrise.days().getFirst().scores()).allSatisfy(score -> assertThat(score).isGreaterThan(9.5));
		assertThat(asked).allSatisfy(point -> assertThat(point[1]).isGreaterThan(-5));
	}

	@Test
	void cloudToTheEastLowersTheSunriseAndLeavesTheSunsetAlone() {
		lowCloudAtLon = lon -> lon >= 0 ? 100 : 0;

		final SunsetMapResponse sunrise = service.getMap(SunEvent.SUNRISE, 51.03, -2.95, 51.38, -2.3);
		final SunsetMapResponse sunset = service.getMap(SunEvent.SUNSET, 51.03, -2.95, 51.38, -2.3);

		assertThat(sunrise.days().getFirst().scores()).allSatisfy(score -> assertThat(score).isBetween(1.0, 9.0));
		assertThat(sunset.days().getFirst().scores()).allSatisfy(score -> assertThat(score).isGreaterThan(9.5));
	}

	@Test
	void theSunriseOverAnAreaReusesTheWeatherFetchedForItsSunset() {
		service.getMap(SunEvent.SUNSET, 51.03, -2.95, 51.38, -2.3);
		final int fetched = asked.size();

		service.getMap(SunEvent.SUNRISE, 51.03, -2.95, 51.38, -2.3);

		// Only the points its paths cross to the east: the area's own are already there.
		assertThat(asked.subList(fetched, asked.size())).isNotEmpty().allSatisfy(point -> assertThat(point[1]).isGreaterThan(-2.3));
	}

	@Test
	void aSecondLookAtTheSameAreaIsAnsweredFromTheCache() {
		service.getMap(SunEvent.SUNSET, 51.03, -2.95, 51.38, -2.3);
		final int fetched = asked.size();

		final SunsetMapResponse again = service.getMap(SunEvent.SUNSET, 51.03, -2.95, 51.38, -2.3);

		assertThat(asked).hasSize(fetched);
		assertThat(again.days()).hasSize(3);
	}

	@Test
	void weatherOlderThanTheCacheAllowsIsFetchedAgain() {
		service.getMap(SunEvent.SUNSET, 51.03, -2.95, 51.38, -2.3);
		final int fetched = asked.size();
		cache.values().forEach(entity -> entity.setFetchedAt(Instant.now().minus(properties.getMapCacheTtl()).minus(Duration.ofMinutes(1))));

		service.getMap(SunEvent.SUNSET, 51.03, -2.95, 51.38, -2.3);

		assertThat(asked).hasSize(2 * fetched);
	}

	@Test
	void aWiderAreaIsScoredOnACoarserLatticeToStayUnderThePointLimit() {
		final SunsetMapResponse britain = service.getMap(SunEvent.SUNSET, 49.5, -11, 61, 3);

		assertThat(britain.latStep()).isEqualTo(1.0);
		assertThat(britain.lonStep()).isEqualTo(2.0);
		assertThat(britain.rows() * britain.cols()).isLessThanOrEqualTo(properties.getMapMaxPoints());
		assertThat(britain.days().getFirst().scores()).hasSize(britain.rows() * britain.cols());
	}

	@Test
	void anAreaTooWideForEvenTheCoarsestLatticeIsRefusedWithoutFetchingAnything() {
		assertThatThrownBy(() -> service.getMap(SunEvent.SUNSET, -90, -180, 90, 180))
						.isInstanceOfSatisfying(ResponseStatusException.class,
										e -> assertThat(e.getStatusCode()).isEqualTo(SunsetMapService.AREA_TOO_LARGE));
		verify(client, never()).getForecasts(anyList(), any(), anyInt());
	}

	/** Three days of a fine evening sky, in the shape Open-Meteo answers with for a single model. */
	private static Map<String, Object> forecast(final double low) {
		final List<Number> times = new ArrayList<>();
		for (int hour = 0; hour < 72; hour++) {
			times.add(MIDNIGHT + hour * HOUR);
		}
		final Map<String, Object> hourly = new HashMap<>();
		hourly.put("time", times);
		hourly.put("cloud_cover_high", constant(50));
		hourly.put("cloud_cover_mid", constant(10));
		hourly.put("cloud_cover_low", constant(low));
		hourly.put("relative_humidity_2m", constant(50));
		hourly.put("visibility", constant(30_000));
		hourly.put("precipitation", constant(0));
		hourly.put("pressure_msl", constant(1010));

		final List<Number> days = new ArrayList<>();
		final List<Number> sunsets = new ArrayList<>();
		final List<Number> sunrises = new ArrayList<>();
		for (int day = 0; day < 3; day++) {
			days.add(MIDNIGHT + day * 24 * HOUR);
			sunsets.add(MIDNIGHT + day * 24 * HOUR + 16 * HOUR + HOUR / 2);
			sunrises.add(MIDNIGHT + day * 24 * HOUR + 7 * HOUR + HOUR / 2);
		}
		return Map.of("utc_offset_seconds", 0, "hourly", hourly,
						"daily", Map.of("time", days, "sunset", sunsets, "sunrise", sunrises));
	}

	private static List<Number> constant(final double value) {
		return Collections.nCopies(72, value);
	}
}
