package to.charlie.basecamp.infrastructure.rest.client;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.observation.ObservationRegistry;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import to.charlie.basecamp.configuration.OpenMeteoProperties;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.ToDoubleFunction;
import java.util.stream.Collectors;

/**
 * Open-Meteo's forecast and air quality APIs. The responses are handed back as the JSON they
 * arrived as: what is in them depends on which models were asked for, since every variable comes
 * back once per model with the model's name appended, and the caller caches them whole.
 */
@Component
public class OpenMeteoApiClient {

	private static final ParameterizedTypeReference<Map<String, Object>> ONE_LOCATION =
					new ParameterizedTypeReference<>() {};
	private static final ParameterizedTypeReference<List<Map<String, Object>>> MANY_LOCATIONS =
					new ParameterizedTypeReference<>() {};

	private static final String LOCAL_VARIABLES = "cloud_cover_low,cloud_cover_mid,cloud_cover_high,"
					+ "relative_humidity_2m,visibility,precipitation,pressure_msl";
	private static final int LOCAL_VARIABLE_COUNT = LOCAL_VARIABLES.split(",").length;

	private final RestClient restClient;
	private final OpenMeteoProperties properties;
	private final MeterRegistry meterRegistry;

	public OpenMeteoApiClient(final OpenMeteoProperties properties, final ObservationRegistry observationRegistry,
	                          final MeterRegistry meterRegistry) {
		this.properties = properties;
		this.meterRegistry = meterRegistry;

		// Its own client rather than the shared one, which has no timeouts: a forecast is fetched
		// while a request waits on it, so a stalled upstream must fail rather than hang.
		final SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
		requestFactory.setConnectTimeout(Duration.ofSeconds(5));
		requestFactory.setReadTimeout(Duration.ofSeconds(20));
		this.restClient = RestClient.builder()
						.requestFactory(requestFactory)
						.observationRegistry(observationRegistry)
						.build();
	}

	/**
	 * Everything the score needs at the point itself, plus one daily variable: its sunset or
	 * sunrise times. Times are unix seconds, and the days are the point's own local ones.
	 */
	public Map<String, Object> getForecast(final double lat, final double lon, final List<String> models, final int days,
	                                       final String daily) {
		recordCalls("forecast", 1, LOCAL_VARIABLE_COUNT + 1, models.size(), days);
		return restClient.get()
						.uri(properties.getForecastUrl()
														+ "?latitude={lat}&longitude={lon}&hourly={hourly}&daily={daily}"
														+ "&timezone=auto&timeformat=unixtime&forecast_days={days}&models={models}",
										lat, lon, LOCAL_VARIABLES, daily, days, String.join(",", models))
						.retrieve()
						.body(ONE_LOCATION);
	}

	/**
	 * The same as {@link #getForecast} for one model at many points at once, in the order
	 * given, with both the sunset and the sunrise times: the weather is the same for either,
	 * so one answer serves both. Each point's days are its own local ones.
	 */
	@SuppressWarnings("unchecked")
	public List<Map<String, Object>> getForecasts(final List<double[]> points, final String model, final int days) {
		recordCalls("forecast", points.size(), LOCAL_VARIABLE_COUNT + 2, 1, days);
		final Object body = restClient.get()
						.uri(properties.getForecastUrl()
														+ "?latitude={lats}&longitude={lons}&hourly={hourly}&daily=sunset,sunrise"
														+ "&timezone=auto&timeformat=unixtime&forecast_days={days}&models={model}",
										coordinates(points, point -> point[0]), coordinates(points, point -> point[1]),
										LOCAL_VARIABLES, days, model)
						.retrieve()
						.body(Object.class);
		// Asked for a single location, Open-Meteo answers with an object rather than a list.
		if (body instanceof List<?> list) {
			return (List<Map<String, Object>>) list;
		}
		if (body instanceof Map<?, ?> map) {
			return List.of((Map<String, Object>) map);
		}
		throw new RestClientException("Unexpected forecast response from Open-Meteo");
	}

	/**
	 * Low and mid cloud at each of the given points, in the order given. Always more than one
	 * point: asked for a single location, Open-Meteo answers with an object rather than a list.
	 */
	public List<Map<String, Object>> getCloud(final List<double[]> points, final List<String> models, final int days) {
		recordCalls("forecast", points.size(), 2, models.size(), days);
		return restClient.get()
						.uri(properties.getForecastUrl()
														+ "?latitude={lats}&longitude={lons}&hourly=cloud_cover_low,cloud_cover_mid"
														+ "&timeformat=unixtime&forecast_days={days}&models={models}",
										coordinates(points, point -> point[0]), coordinates(points, point -> point[1]),
										days, String.join(",", models))
						.retrieve()
						.body(MANY_LOCATIONS);
	}

	/**
	 * Aerosol optical depth, which comes from one atmospheric model whichever weather models the
	 * forecast uses.
	 */
	public Map<String, Object> getAerosols(final double lat, final double lon, final int days) {
		recordCalls("air_quality", 1, 1, 1, days);
		return restClient.get()
						.uri(properties.getAirQualityUrl()
														+ "?latitude={lat}&longitude={lon}&hourly=aerosol_optical_depth"
														+ "&timeformat=unixtime&forecast_days={days}",
										lat, lon, days)
						.retrieve()
						.body(ONE_LOCATION);
	}

	/**
	 * Counts a request against Open-Meteo's allowance the way Open-Meteo says it does, as near
	 * as it says: every location is a call, and one location is several once it asks for more
	 * than 10 variables or more than 2 weeks, in fractions. Each model sends every variable
	 * back again, so variables are counted once per model. Open-Meteo publishes no exact
	 * formula, so this is an estimate. Counted whether or not the request succeeds.
	 */
	private void recordCalls(final String api, final int locations, final int variables, final int models,
	                         final int days) {
		Counter.builder("basecamp.openmeteo.calls")
						.description("Estimated Open-Meteo API calls, as counted against its rate limits")
						.tag("api", api)
						.register(meterRegistry)
						.increment(calls(locations, variables, models, days));
		Counter.builder("basecamp.openmeteo.locations")
						.description("Locations asked of Open-Meteo")
						.tag("api", api)
						.register(meterRegistry)
						.increment(locations);
	}

	static double calls(final int locations, final int variables, final int models, final int days) {
		return locations * Math.max(1, variables * models / 10.0) * Math.max(1, days / 14.0);
	}

	private static String coordinates(final List<double[]> points, final ToDoubleFunction<double[]> axis) {
		return points.stream()
						.map(point -> String.format(Locale.ROOT, "%.4f", axis.applyAsDouble(point)))
						.collect(Collectors.joining(","));
	}
}
