package to.charlie.integrationTests.basecamp;

import io.cucumber.java.BeforeAll;
import io.cucumber.spring.CucumberContextConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import to.charlie.basecamp.BasecampApplication;
import to.charlie.integrationTests.basecamp.utilities.Ports;

@CucumberContextConfiguration
@SpringBootTest(
				classes = {BasecampApplication.class, TestConfig.class},
				webEnvironment = WebEnvironment.DEFINED_PORT,
				properties = "server.port=" + Ports.SPRING)
public class CucumberSpringConfiguration {

	@BeforeAll
	public static void beforeAll() {
		// Start the shared Postgres before Spring reads the datasource properties.
		PostgresContainer.getInstance();
	}
}
