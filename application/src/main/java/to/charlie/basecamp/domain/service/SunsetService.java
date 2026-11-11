package to.charlie.basecamp.domain.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import to.charlie.basecamp.configuration.SunsetProperties;
import to.charlie.basecamp.domain.model.SunEvent;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetDay;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetForecastResponse;
import to.charlie.basecamp.domain.model.dto.sunset.SunsetModelForecast;
import to.charlie.basecamp.domain.model.entity.SunsetCellId;
import to.charlie.basecamp.domain.model.entity.SunsetWeatherEntity;
import to.charlie.basecamp.infrastructure.dal.repository.SunsetWeatherRepository;
import to.charlie.basecamp.infrastructure.rest.client.OpenMeteoApiClient;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;

/**
 * How good the next few sunsets or sunrises at a point are likely to be, according to each of
 * the configured weather models.
 *
 * <p>The weather is fetched once per grid cell and event for all the models together and cached; the
 * scores are worked out from it on every request.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SunsetService {

	static final int FORECAST_DAYS = 3;
	// The air quality forecast runs out sooner than the weather one.
	private static final int AIR_QUALITY_MAX_DAYS = 5;

	private final OpenMeteoApiClient openMeteoApiClient;
	private final SunsetWeatherRepository sunsetWeatherRepository;
	private final SunsetScorer sunsetScorer;
	private final SunsetProperties sunsetProperties;

	public SunsetForecastResponse getForecast(final SunEvent event, final double lat, final double lon) {
		final SunsetCellId cell = SunsetCellId.containing(lat, lon, event);
		final SunsetWeatherEntity weather = cached(cell).orElseGet(() -> fetch(cell));

		final Map<String, Object> forecast = weather.getForecast();
		final int utcOffsetSeconds = ((Number) forecast.get("utc_offset_seconds")).intValue();
		final List<LocalDate> dates = dates(forecast);
		final WeatherSeries aerosols = WeatherSeries.of(weather.getAerosols(), null);

		final List<SunsetModelForecast> models = new ArrayList<>();
		for (final String model : sunsetProperties.getModels()) {
			final WeatherSeries local = WeatherSeries.of(forecast, model);
			final List<Number> sunsets = times(forecast, event, model);
			final List<SunsetDay> days = new ArrayList<>();

			for (int day = 0; day < dates.size() && local != null && sunsets != null; day++) {
				// No sunset or sunrise at all during polar day or night, which leaves nothing to score.
				final Number sunset = sunsets.get(day);
				if (sunset == null || sunset.longValue() == 0) {
					continue;
				}
				final int pathPoints = SunsetScorer.PATH_POINTS_KM.size();
				final List<WeatherSeries> path = weather.getPath().subList(day * pathPoints, (day + 1) * pathPoints)
								.stream()
								.map(point -> WeatherSeries.of(point, model))
								.toList();

				final LocalDate date = dates.get(day);
				sunsetScorer.score(event, date, sunset.longValue(), SunsetGeometry.azimuth(event, cell.lat(), date), local, path, aerosols)
								.ifPresent(days::add);
			}
			models.add(new SunsetModelForecast(model, days));
		}

		return new SunsetForecastResponse(
						cell.lat(), cell.lon(), utcOffsetSeconds, weather.getFetchedAt(), SunsetScorer.PATH_POINTS_KM, models);
	}

	private Optional<SunsetWeatherEntity> cached(final SunsetCellId cell) {
		final Instant oldestFresh = Instant.now().minus(sunsetProperties.getCacheTtl());
		return sunsetWeatherRepository.findById(cell)
						.filter(weather -> weather.getFetchedAt().isAfter(oldestFresh))
						.filter(weather -> weather.getModels().equals(modelsKey()));
	}

	private SunsetWeatherEntity fetch(final SunsetCellId cell) {
		final List<String> models = sunsetProperties.getModels();
		log.info("{} weather not in cache for cell {},{} - fetching from Open-Meteo", cell.getEvent(), cell.lat(), cell.lon());

		final Map<String, Object> forecast;
		final List<Map<String, Object>> path;
		try {
			forecast = openMeteoApiClient.getForecast(cell.lat(), cell.lon(), models, FORECAST_DAYS, cell.getEvent().variable());

			// Every day's points go in the one request. The bearing moves a little from day to
			// day, so each day gets its own.
			final List<double[]> points = new ArrayList<>();
			for (final LocalDate date : dates(forecast)) {
				final double azimuth = SunsetGeometry.azimuth(cell.getEvent(), cell.lat(), date);
				for (final int km : SunsetScorer.PATH_POINTS_KM) {
					points.add(SunsetGeometry.destination(cell.lat(), cell.lon(), azimuth, km));
				}
			}
			// These come back on UTC days rather than the cell's local ones, so they are asked
			// for one day more to be sure of covering the last local day.
			path = openMeteoApiClient.getCloud(points, models, FORECAST_DAYS + 1);
		} catch (final RestClientException e) {
			log.error("Failed to fetch sunset weather for cell {},{}", cell.lat(), cell.lon(), e);
			throw new ResponseStatusException(BAD_GATEWAY, "Weather forecast unavailable", e);
		}

		final SunsetWeatherEntity weather = SunsetWeatherEntity.builder()
						.id(cell)
						.fetchedAt(Instant.now())
						.models(modelsKey())
						.forecast(forecast)
						.path(path)
						.aerosols(fetchAerosols(cell))
						.build();
		try {
			return sunsetWeatherRepository.save(weather);
		} catch (final DataIntegrityViolationException e) {
			// Two requests for a cell nobody had asked about before, both inserting it. The
			// other one's row is as good as this one's, and this request can answer without it.
			log.debug("Sunset weather for cell {},{} was cached concurrently", cell.lat(), cell.lon());
			return weather;
		}
	}

	/** Aerosols only refine the clarity factor, so the forecast goes ahead without them. */
	private Map<String, Object> fetchAerosols(final SunsetCellId cell) {
		try {
			return openMeteoApiClient.getAerosols(cell.lat(), cell.lon(), Math.min(FORECAST_DAYS + 1, AIR_QUALITY_MAX_DAYS));
		} catch (final RestClientException e) {
			log.warn("Failed to fetch aerosols for cell {},{} - scoring without them", cell.lat(), cell.lon(), e);
			return null;
		}
	}

	private String modelsKey() {
		return String.join(",", sunsetProperties.getModels());
	}

	/**
	 * The forecast's days as local dates. Open-Meteo gives each as the unix time of its local
	 * midnight, so shifting by the offset and reading the result as UTC recovers the date.
	 */
	@SuppressWarnings("unchecked")
	static List<LocalDate> dates(final Map<String, Object> forecast) {
		final int utcOffsetSeconds = ((Number) forecast.get("utc_offset_seconds")).intValue();
		final List<Number> midnights = (List<Number>) ((Map<String, Object>) forecast.get("daily")).get("time");
		return midnights.stream()
						.map(midnight -> Instant.ofEpochSecond(midnight.longValue() + utcOffsetSeconds).atOffset(ZoneOffset.UTC).toLocalDate())
						.toList();
	}

	/**
	 * When the sun sets or rises on each of the forecast's days, or null when the forecast was
	 * not asked for that. Suffixed with the model when several were asked for and bare for one,
	 * like the hourly variables.
	 */
	@SuppressWarnings("unchecked")
	static List<Number> times(final Map<String, Object> forecast, final SunEvent event, final String model) {
		final Map<String, Object> daily = (Map<String, Object>) forecast.get("daily");
		final Object perModel = daily.get(event.variable() + "_" + model);
		return (List<Number>) (perModel != null ? perModel : daily.get(event.variable()));
	}
}
