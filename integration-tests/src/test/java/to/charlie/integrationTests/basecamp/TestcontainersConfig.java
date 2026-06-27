package to.charlie.integrationTests.basecamp;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Spins up a throw-away Postgres for the integration tests. {@link ServiceConnection} wires the
 * container's JDBC url/credentials into the Spring context automatically, so the application boots
 * against it (Flyway migrations included).
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfig {

	@Bean
	@ServiceConnection
	PostgreSQLContainer<?> postgresContainer() {
		return new PostgreSQLContainer<>("postgres:16-alpine");
	}
}
