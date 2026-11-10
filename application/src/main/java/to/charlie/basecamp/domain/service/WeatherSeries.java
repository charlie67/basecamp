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

	// Set instead of the above for a blend of other series.
	private final List<WeatherSeries> parts;
	private final double[] weights;

	private WeatherSeries(final Map<String, Object> hourly, final String model) {
		this.hourly = hourly;
		this.model = model;
		this.time = numbers(hourly.get("time"));
		this.parts = null;
		this.weights = null;
	}

	private WeatherSeries(final List<WeatherSeries> parts, final double[] weights) {
		this.hourly = null;
		this.model = null;
		this.time = null;
		this.parts = parts;
		this.weights = weights;
	}

	/**
	 * The weighted mean of several series, for the weather at a place between the points there
	 * are forecasts for. A part with no value at the time asked about is left out of the mean
	 * rather than counted as zero, as is a null part.
	 */
	static WeatherSeries blend(final List<WeatherSeries> parts, final double[] weights) {
		return new WeatherSeries(parts, weights);
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
		if (parts != null) {
			double total = 0;
			double totalWeight = 0;
			for (int i = 0; i < parts.size(); i++) {
				final Double value = parts.get(i) == null ? null : parts.get(i).valueAt(variable, ts);
				if (value != null) {
					total += value * weights[i];
					totalWeight += weights[i];
				}
			}
			return totalWeight > 0 ? Double.valueOf(total / totalWeight) : null;
		}
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
		if (parts != null) {
			double total = 0;
			double totalWeight = 0;
			for (int i = 0; i < parts.size(); i++) {
				if (parts.get(i) == null) {
					continue;
				}
				total += parts.get(i).totalBetween(variable, start, end) * weights[i];
				totalWeight += weights[i];
			}
			return totalWeight > 0 ? total / totalWeight : 0;
		}
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
