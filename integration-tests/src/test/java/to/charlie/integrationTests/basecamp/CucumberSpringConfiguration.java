package to.charlie.integrationTests.basecamp;

import io.cucumber.spring.CucumberContextConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import to.charlie.basecamp.BasecampApplication;

@CucumberContextConfiguration
@SpringBootTest(
				classes = {BasecampApplication.class, TestcontainersConfig.class},
				webEnvironment = WebEnvironment.RANDOM_PORT)
public class CucumberSpringConfiguration {

}
