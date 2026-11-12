package to.charlie.basecamp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;
import to.charlie.basecamp.configuration.OsMapsProperties;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(
				{OsMapsProperties.class}
)
public class BasecampApplication {

	static void main(final String[] args) {
		SpringApplication.run(BasecampApplication.class, args);
	}

}
