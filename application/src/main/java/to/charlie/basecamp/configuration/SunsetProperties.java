package to.charlie.basecamp.configuration;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.List;

@Configuration
@ConfigurationProperties(prefix = "sunset")
@Getter
@Setter
public class SunsetProperties {

	/**
	 * The weather models each sunset is scored against, by Open-Meteo's own names for them.
	 * Every one is scored separately and returned side by side, in this order.
	 */
	private List<String> models = List.of(
					"ukmo_seamless", "icon_seamless", "gfs_seamless", "ecmwf_ifs025", "meteofrance_seamless");

	/**
	 * How long fetched weather is served from the cache. The models themselves only publish a
	 * new run every one to six hours, so asking more often than this gains nothing.
	 */
	private Duration cacheTtl = Duration.ofHours(1);
}
