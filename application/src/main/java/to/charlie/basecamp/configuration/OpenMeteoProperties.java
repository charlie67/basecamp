package to.charlie.basecamp.configuration;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Open-Meteo is keyless, so unlike the map providers there is nothing here that has to be
 * supplied: the defaults are the public endpoints.
 */
@Configuration
@ConfigurationProperties(prefix = "openmeteo")
@Getter
@Setter
public class OpenMeteoProperties {
	private String forecastUrl = "https://api.open-meteo.com/v1/forecast";
	private String airQualityUrl = "https://air-quality-api.open-meteo.com/v1/air-quality";
}
