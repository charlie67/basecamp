package to.charlie.integrationTests.basecamp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * A single throw-away Postgres shared by every scenario. Started once in
 * {@link CucumberSpringConfiguration}, it exports its JDBC coordinates as system properties that the
 * test {@code application.properties} reads, so the application boots against it (Flyway included).
 */
public class PostgresContainer extends PostgreSQLContainer<PostgresContainer> {

	private static final Logger logger = LoggerFactory.getLogger(PostgresContainer.class);
	private static final String IMAGE_VERSION = "postgres:18.2-alpine3.23";
	private static PostgresContainer container;

	private PostgresContainer() {
		super(IMAGE_VERSION);
	}

	public static PostgresContainer getInstance() {
		if (container == null) {
			container = new PostgresContainer()
							.withUsername("basecamp")
							.withPassword("basecamp")
							.withDatabaseName("basecamp");
			container.start();
			logger.info("PostgresContainer started with URL: {}", container.getJdbcUrl());
			System.setProperty("DB_URL", container.getJdbcUrl());
			System.setProperty("DB_USERNAME", container.getUsername());
			System.setProperty("DB_PASSWORD", container.getPassword());
		}
		return container;
	}

	@Override
	public void stop() {
		logger.info("PostgresContainer stop() ignored; container is reused for the whole suite.");
	}
}
