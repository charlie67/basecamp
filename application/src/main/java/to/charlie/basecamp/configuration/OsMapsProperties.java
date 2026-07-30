package to.charlie.basecamp.configuration;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "osmaps")
@Getter
@Setter
public class OsMapsProperties {
	private String apiKey;
	private String apiUrl;
}
