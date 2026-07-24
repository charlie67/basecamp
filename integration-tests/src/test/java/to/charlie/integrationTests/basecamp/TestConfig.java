package to.charlie.integrationTests.basecamp;

import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import to.charlie.integrationTests.basecamp.utilities.Context;
import to.charlie.integrationTests.basecamp.utilities.DataLoader;

/**
 * Boots the real application beans alongside the test-harness beans (context store, data loader,
 * step definitions), so the scenarios drive the same wiring the app runs in production.
 */
@Configuration
@ComponentScan(basePackages = {"to.charlie.basecamp", "to.charlie.integrationTests.basecamp"})
@EnableAutoConfiguration
public class TestConfig {

	@Bean
	public Context context() {
		return new Context();
	}

	@Bean
	public DataLoader loader(final Context context) {
		return new DataLoader(context);
	}
}
