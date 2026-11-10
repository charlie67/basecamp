package to.charlie.basecamp.domain.service;

import java.util.List;
import java.util.Map;

/**
 * One model's hourly variables out of an Open-Meteo response.
 *
 * <p>Asked for several models at once, Open-Meteo returns every variable once per model with the
 * model's name appended ({@code cloud_cover_low_icon_seamless}); asked for one, it leaves the
 * name bare. This reads either, so the scoring never has to know which it was given.
 */
final class WeatherSeries {

	private final List<Number> time;
	private final Map<String, Object> hourly;
	private final String model;

	private WeatherSeries(final Map<String, Object> hourly, final String model) {
		this.hourly = hourly;
		this.model = model;
		this.time = numbers(hourly.get("time"));
	}

	/**
	 * @param response a whole Open-Meteo response, or null when there was none to be had
	 * @param model    the model to read, or null for a response that is not per-model
	 * @return null for a null response
	 */
	@SuppressWarnings("unchecked")
	static WeatherSeries of(final Map<String, Object> response, final String model) {
		if (response == null || !(response.get("hourly") instanceof Map<?, ?> hourly)) {
			return null;
		}
		return new WeatherSeries((Map<String, Object>) hourly, model);
	}

	/** The variable linearly interpolated to unix time {@code ts}, or null where there is no value. */
	Double valueAt(final String variable, final long ts) {
		final List<Number> values = values(variable);
		if (values == null) {
			return null;
		}
		for (int i = 0; i < time.size() - 1; i++) {
			final long start = time.get(i).longValue();
			final long end = time.get(i + 1).longValue();
			if (start <= ts && ts <= end) {
				final Number a = values.get(i);
				final Number b = values.get(i + 1);
				if (a == null || b == null) {
					return a != null ? Double.valueOf(a.doubleValue()) : b != null ? Double.valueOf(b.doubleValue()) : null;
				}
				return a.doubleValue() + (b.doubleValue() - a.doubleValue()) * (ts - start) / (double) (end - start);
			}
		}
		return null;
	}

	double totalBetween(final String variable, final long start, final long end) {
		final List<Number> values = values(variable);
		if (values == null) {
			return 0;
		}
		double total = 0;
		for (int i = 0; i < time.size(); i++) {
			final long t = time.get(i).longValue();
			if (start <= t && t <= end && values.get(i) != null) {
				total += values.get(i).doubleValue();
			}
		}
		return total;
	}

	private List<Number> values(final String variable) {
		final Object perModel = model == null ? null : hourly.get(variable + "_" + model);
		return numbers(perModel != null ? perModel : hourly.get(variable));
	}

	@SuppressWarnings("unchecked")
	private static List<Number> numbers(final Object value) {
		return value instanceof List<?> list ? (List<Number>) list : null;
	}
}
