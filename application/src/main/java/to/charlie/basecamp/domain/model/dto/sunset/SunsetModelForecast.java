package to.charlie.basecamp.domain.model.dto.sunset;

import java.util.List;

/**
 * @param model Open-Meteo's name for the weather model
 * @param days  a day is missing when the model had no sunset or no weather for it
 */
public record SunsetModelForecast(
				String model,
				List<SunsetDay> days
) {}
