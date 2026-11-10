package to.charlie.basecamp.infrastructure.rest.client;

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

	private final RestClient restClient;
	private final OpenMeteoProperties properties;

	public OpenMeteoApiClient(final OpenMeteoProperties properties) {
		this.properties = properties;

		// Its own client rather than the shared one, which has no timeouts: a forecast is fetched
		// while a request waits on it, so a stalled upstream must fail rather than hang.
		final SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
		requestFactory.setConnectTimeout(Duration.ofSeconds(5));
		requestFactory.setReadTimeout(Duration.ofSeconds(20));
		this.restClient = RestClient.builder().requestFactory(requestFactory).build();
	}

	/**
	 * Everything the score needs at the point itself, plus its sunset times. Times are unix
	 * seconds, and the days are the point's own local ones.
	 */
	public Map<String, Object> getForecast(final double lat, final double lon, final List<String> models, final int days) {
		return restClient.get()
						.uri(properties.getForecastUrl()
														+ "?latitude={lat}&longitude={lon}&hourly={hourly}&daily=sunset"
														+ "&timezone=auto&timeformat=unixtime&forecast_days={days}&models={models}",
										lat, lon, LOCAL_VARIABLES, days, String.join(",", models))
						.retrieve()
						.body(ONE_LOCATION);
	}

	/**
	 * The same as {@link #getForecast} for one model at many points at once, in the order
	 * given. Each point's days are its own local ones.
	 */
	@SuppressWarnings("unchecked")
	public List<Map<String, Object>> getForecasts(final List<double[]> points, final String model, final int days) {
		final Object body = restClient.get()
						.uri(properties.getForecastUrl()
														+ "?latitude={lats}&longitude={lons}&hourly={hourly}&daily=sunset"
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
		return restClient.get()
						.uri(properties.getAirQualityUrl()
														+ "?latitude={lat}&longitude={lon}&hourly=aerosol_optical_depth"
														+ "&timeformat=unixtime&forecast_days={days}",
										lat, lon, days)
						.retrieve()
						.body(ONE_LOCATION);
	}

	private static String coordinates(final List<double[]> points, final ToDoubleFunction<double[]> axis) {
		return points.stream()
						.map(point -> String.format(Locale.ROOT, "%.4f", axis.applyAsDouble(point)))
						.collect(Collectors.joining(","));
	}
}
