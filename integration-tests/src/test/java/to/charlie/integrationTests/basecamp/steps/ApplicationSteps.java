package to.charlie.integrationTests.basecamp.steps;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;

public class ApplicationSteps {

	@Autowired
	private ApplicationContext applicationContext;

	@Given("the application is running")
	public void theApplicationIsRunning() {
		// The Spring context is started by CucumberSpringConfiguration.
	}

	@Then("the Spring context is available")
	public void theSpringContextIsAvailable() {
		assertThat(applicationContext).isNotNull();
	}
}
