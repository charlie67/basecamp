package to.charlie.basecamp.configuration;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "mapbox")
@Getter
@Setter
public class MapBoxProperties {
	private String apiKey;
	private String apiUrl;
}
