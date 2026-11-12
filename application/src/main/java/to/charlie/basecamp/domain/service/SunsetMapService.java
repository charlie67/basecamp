package to.charlie.basecamp.domain.service;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import to.charlie.basecamp.configuration.SunsetProperties;
import to.charlie.basecamp.domain.model.SunEvent;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetDay;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetMapDay;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetMapResponse;
import to.charlie.basecamp.domain.model.entity.SunsetMapPointId;
import to.charlie.basecamp.domain.model.entity.SunsetMapWeatherEntity;
import to.charlie.basecamp.infrastructure.dal.repository.SunsetMapWeatherRepository;
import to.charlie.basecamp.infrastructure.rest.client.OpenMeteoApiClient;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;

/**
 * Sunset or sunrise scores across a whole area at once, for colouring the map with.
 *
 * <p>The area is covered by a regular lattice of points, coarser the more ground it takes in,
 * and each point is scored as {@link SunsetService} scores one, with two economies that make
 * hundreds of points affordable. Only one weather model is used. And the cloud along each
 * point's path toward the sun is not fetched for that point alone: it is read off the lattice,
 * interpolated between the points nearest the path, so neighbouring points share it.
 *
 * <p>That also means a point's weather is the same whichever of the two is being scored, so
 * the sunset and the sunrise are answered from the one cache.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SunsetMapService {

	/** Asked for more ground than the coarsest lattice can cover within the point limit. */
	public static final HttpStatusCode AREA_TOO_LARGE = HttpStatusCode.valueOf(422);

	/**
	 * Row spacings the lattice can take, in hundredths of a degree, finest first. Columns are
	 * twice as far apart in degrees, which makes the cells roughly square on the ground at
	 * British latitudes. The finest matches the grid a clicked point is forecast on.
	 */
	private static final int[] LAT_STEPS = {10, 25, 50, 100, 200, 400};
	private static final int LON_STEP_FACTOR = 2;

	/**
	 * The finest lattice the cloud along the sun's path is read from. The path runs out to
	 * 300km, so following it on a fine lattice would mean fetching far more points beyond the
	 * view than inside it.
	 */
	private static final int PATH_MIN_LAT_STEP = 50;

	private static final int MAX_LAT_HUNDREDTHS = 9_000;
	private static final int POINTS_PER_REQUEST = 100;

	private final OpenMeteoApiClient openMeteoApiClient;
	private final SunsetMapWeatherRepository sunsetMapWeatherRepository;
	private final SunsetScorer sunsetScorer;
	private final SunsetProperties sunsetProperties;
	private final MeterRegistry meterRegistry;

	// One fetch at a time, so two overlapping views do not both pay for the points they share.
	private final Lock fetchLock = new ReentrantLock();

	/** A point's cloud as a weighted mix of the lattice points around it. */
	private record Blend(List<SunsetMapPointId> corners, List<Double> weights) {}

	/** Everything one point's score for one day's sunset or sunrise is worked out from. */
	private record Moment(LocalDate date, long time, int utcOffsetSeconds, double azimuth, List<Blend> path) {}

	public SunsetMapResponse getMap(final SunEvent event, final double south, final double west, final double north, final double east) {
		final int latStep = latStep(south, west, north, east);
		final int lonStep = latStep * LON_STEP_FACTOR;
		final int firstRow = firstRow(south, latStep);
		final int rows = lastRow(north, latStep) - firstRow + 1;
		final int firstCol = Math.floorDiv((int) Math.floor(west * 100), lonStep);
		final int cols = Math.ceilDiv((int) Math.ceil(east * 100), lonStep) - firstCol + 1;

		final List<SunsetMapPointId> points = new ArrayList<>(rows * cols);
		for (int row = 0; row < rows; row++) {
			for (int col = 0; col < cols; col++) {
				points.add(SunsetMapPointId.of((firstRow + row) * latStep, (firstCol + col) * lonStep));
			}
		}

		final String model = sunsetProperties.getMapModel();
		final Map<SunsetMapPointId, SunsetMapWeatherEntity> weather = new HashMap<>();
		load(points, model, weather);

		// Where each path lies depends on the date at the point, which is only known once
		// its own weather is in. So the paths are laid out now and loaded in a second pass.
		final int pathLatStep = Math.max(latStep, PATH_MIN_LAT_STEP);
		final List<List<Moment>> moments = points.stream()
						.map(point -> moments(event, point, weather.get(point).getForecast(), model, pathLatStep))
						.toList();
		final Set<SunsetMapPointId> pathPoints = new LinkedHashSet<>();
		moments.forEach(point -> point.forEach(moment -> {
			if (moment != null) {
				moment.path().forEach(blend -> pathPoints.addAll(blend.corners()));
			}
		}));
		load(pathPoints, model, weather);

		final Map<SunsetMapPointId, WeatherSeries> series = new HashMap<>();
		weather.forEach((id, entity) -> series.put(id, WeatherSeries.of(entity.getForecast(), model)));

		// The middle of the map stands for the whole of it when saying which day and what time.
		final int middle = (rows / 2) * cols + cols / 2;
		final List<SunsetMapDay> days = new ArrayList<>();
		for (int day = 0; day < SunsetService.FORECAST_DAYS; day++) {
			final List<Double> scores = new ArrayList<>(points.size());
			Moment representative = moments.get(middle).get(day);
			boolean any = false;
			for (int i = 0; i < points.size(); i++) {
				final Moment moment = moments.get(i).get(day);
				final Double score = moment == null ? null : score(event, moment, series.get(points.get(i)), series);
				scores.add(score);
				if (score != null) {
					any = true;
					if (representative == null) {
						representative = moment;
					}
				}
			}
			if (any && representative != null) {
				days.add(new SunsetMapDay(representative.date(), representative.time(), representative.utcOffsetSeconds(), scores));
			}
		}

		final Instant oldest = points.stream()
						.map(point -> weather.get(point).getFetchedAt())
						.min(Instant::compareTo)
						.orElseThrow();
		return new SunsetMapResponse(
						firstRow * latStep / 100.0, firstCol * lonStep / 100.0, latStep / 100.0, lonStep / 100.0,
						rows, cols, model, oldest, days);
	}

	/** The finest spacing that covers the area without going over the point limit. */
	private int latStep(final double south, final double west, final double north, final double east) {
		for (final int latStep : LAT_STEPS) {
			final int lonStep = latStep * LON_STEP_FACTOR;
			final long rows = lastRow(north, latStep) - firstRow(south, latStep) + 1L;
			final long cols = Math.ceilDiv((int) Math.ceil(east * 100), lonStep)
							- Math.floorDiv((int) Math.floor(west * 100), lonStep) + 1L;
			if (rows * cols <= sunsetProperties.getMapMaxPoints()) {
				return latStep;
			}
		}
		throw new ResponseStatusException(AREA_TOO_LARGE, "Area too large to score - zoom in");
	}

	// The rows reach just past the area on both sides, so the scores can be interpolated right
	// up to its edges, but never past the poles.
	private static int firstRow(final double south, final int latStep) {
		return Math.max(Math.floorDiv((int) Math.floor(south * 100), latStep), -MAX_LAT_HUNDREDTHS / latStep);
	}

	private static int lastRow(final double north, final int latStep) {
		return Math.min(Math.ceilDiv((int) Math.ceil(north * 100), latStep), MAX_LAT_HUNDREDTHS / latStep);
	}

	/** One entry per forecast day, null for a day the sun does not set or rise on at the point. */
	private static List<Moment> moments(final SunEvent event, final SunsetMapPointId point, final Map<String, Object> forecast,
	                                      final String model, final int pathLatStep) {
		final int utcOffsetSeconds = ((Number) forecast.get("utc_offset_seconds")).intValue();
		final List<LocalDate> dates = SunsetService.dates(forecast);
		final List<Number> times = SunsetService.times(forecast, event, model);

		final List<Moment> moments = new ArrayList<>();
		for (int day = 0; day < SunsetService.FORECAST_DAYS; day++) {
			// Neither happens during polar day or night, which leaves nothing to score.
			final Number time = times != null && day < times.size() && day < dates.size() ? times.get(day) : null;
			if (time == null || time.longValue() == 0) {
				moments.add(null);
				continue;
			}
			final double azimuth = SunsetGeometry.azimuth(event, point.lat(), dates.get(day));
			final List<Blend> path = SunsetScorer.PATH_POINTS_KM.stream()
							.map(km -> SunsetGeometry.destination(point.lat(), point.lon(), azimuth, km))
							.map(place -> blend(place[0], place[1], pathLatStep))
							.toList();
			moments.add(new Moment(dates.get(day), time.longValue(), utcOffsetSeconds, azimuth, path));
		}
		return moments;
	}

	/** The four lattice points around a place, weighted by how close each is to it. */
	private static Blend blend(final double lat, final double lon, final int latStep) {
		final int lonStep = latStep * LON_STEP_FACTOR;
		final double row = lat * 100 / latStep;
		final double col = lon * 100 / lonStep;
		final int row0 = (int) Math.floor(row);
		final int col0 = (int) Math.floor(col);

		final List<SunsetMapPointId> corners = new ArrayList<>(4);
		final List<Double> weights = new ArrayList<>(4);
		for (int dRow = 0; dRow <= 1; dRow++) {
			for (int dCol = 0; dCol <= 1; dCol++) {
				final double weight = (dRow == 0 ? 1 - (row - row0) : row - row0) * (dCol == 0 ? 1 - (col - col0) : col - col0);
				final int latHundredths = (row0 + dRow) * latStep;
				// A place exactly on the lattice has corners that count for nothing.
				if (weight > 0 && Math.abs(latHundredths) <= MAX_LAT_HUNDREDTHS) {
					corners.add(SunsetMapPointId.of(latHundredths, (col0 + dCol) * lonStep));
					weights.add(weight);
				}
			}
		}
		return new Blend(corners, weights);
	}

	/** Scored without aerosols, which would take a second request for every point. */
	private Double score(final SunEvent event, final Moment moment, final WeatherSeries local, final Map<SunsetMapPointId, WeatherSeries> series) {
		if (local == null) {
			return null;
		}
		final List<WeatherSeries> path = moment.path().stream()
						.map(blend -> WeatherSeries.blend(
										blend.corners().stream().map(series::get).toList(),
										blend.weights().stream().mapToDouble(Double::doubleValue).toArray()))
						.toList();
		return sunsetScorer.score(event, moment.date(), moment.time(), moment.azimuth(), local, path, null)
						.map(SunsetDay::score)
						.map(score -> Math.round(score * 10) / 10.0)
						.orElse(null);
	}

	/** Puts the weather for every one of the points into {@code weather}, fetching what the cache lacks. */
	private void load(final Collection<SunsetMapPointId> points, final String model,
	                  final Map<SunsetMapPointId, SunsetMapWeatherEntity> weather) {
		final List<SunsetMapPointId> wanted = points.stream().filter(point -> !weather.containsKey(point)).distinct().toList();
		if (wanted.isEmpty()) {
			return;
		}

		fetchLock.lock();
		try {
			final Instant oldestFresh = Instant.now().minus(sunsetProperties.getMapCacheTtl());
			sunsetMapWeatherRepository.findAllById(wanted).stream()
							.filter(cached -> cached.getFetchedAt().isAfter(oldestFresh))
							.filter(cached -> cached.getModel().equals(model))
							.filter(SunsetMapService::startsToday)
							.filter(SunsetMapService::hasBothEvents)
							.forEach(cached -> weather.put(cached.getId(), cached));

			final List<SunsetMapPointId> missing = wanted.stream().filter(point -> !weather.containsKey(point)).toList();
			SunsetService.countCache(meterRegistry, "map", "hit", wanted.size() - missing.size());
			SunsetService.countCache(meterRegistry, "map", "miss", missing.size());
			if (missing.isEmpty()) {
				return;
			}
			log.info("Sunset map weather not in cache for {} of {} points - fetching from Open-Meteo", missing.size(), wanted.size());

			final List<SunsetMapWeatherEntity> fetched = new ArrayList<>();
			try {
				for (int from = 0; from < missing.size(); from += POINTS_PER_REQUEST) {
					final List<SunsetMapPointId> batch = missing.subList(from, Math.min(from + POINTS_PER_REQUEST, missing.size()));
					final List<Map<String, Object>> forecasts = openMeteoApiClient.getForecasts(
									batch.stream().map(point -> new double[]{point.lat(), point.lon()}).toList(),
									model, SunsetService.FORECAST_DAYS);
					if (forecasts.size() != batch.size()) {
						throw new RestClientException("Open-Meteo answered for " + forecasts.size() + " of " + batch.size() + " points");
					}
					final Instant now = Instant.now();
					for (int i = 0; i < batch.size(); i++) {
						fetched.add(SunsetMapWeatherEntity.builder()
										.id(batch.get(i)).fetchedAt(now).model(model).forecast(forecasts.get(i)).build());
					}
				}
			} catch (final HttpClientErrorException.TooManyRequests e) {
				// Every point counts as a call against Open-Meteo's limits. What was fetched
				// before it ran out is kept, so asking again in a minute picks up the rest.
				log.warn("Open-Meteo rate limit reached fetching sunset map weather for {} points", missing.size());
				throw new ResponseStatusException(TOO_MANY_REQUESTS, "Weather forecast rate limit reached", e);
			} catch (final RestClientException e) {
				log.error("Failed to fetch sunset map weather for {} points", missing.size(), e);
				throw new ResponseStatusException(BAD_GATEWAY, "Weather forecast unavailable", e);
			} finally {
				// Kept even when a later request failed, so that trying again only asks for the rest.
				save(fetched);
			}
			fetched.forEach(entity -> weather.put(entity.getId(), entity));
		} finally {
			fetchLock.unlock();
		}
	}

	private void save(final List<SunsetMapWeatherEntity> fetched) {
		try {
			sunsetMapWeatherRepository.saveAll(fetched);
		} catch (final DataIntegrityViolationException e) {
			// Another instance cached some of the same points first. Its rows are as good as
			// these, and this request can answer from what it fetched itself.
			log.debug("Sunset map weather was cached concurrently", e);
		}
	}

	/** False for a row cached before the sunrise was forecast, which holds the sunset times alone. */
	private static boolean hasBothEvents(final SunsetMapWeatherEntity cached) {
		return cached.getForecast().get("daily") instanceof Map<?, ?> daily
						&& daily.containsKey(SunEvent.SUNSET.variable()) && daily.containsKey(SunEvent.SUNRISE.variable());
	}

	/**
	 * Whether the forecast's first day is still today where the point is. One fetched late in
	 * the moment is otherwise served past midnight with yesterday as its first day.
	 */
	private static boolean startsToday(final SunsetMapWeatherEntity cached) {
		final Map<String, Object> forecast = cached.getForecast();
		final int utcOffsetSeconds = ((Number) forecast.get("utc_offset_seconds")).intValue();
		final List<LocalDate> dates = SunsetService.dates(forecast);
		return !dates.isEmpty() && dates.getFirst().equals(LocalDate.now(ZoneOffset.ofTotalSeconds(utcOffsetSeconds)));
	}
}
