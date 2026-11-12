package to.charlie.basecamp.infrastructure.rest.client;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OpenMeteoApiClientTest {

	@Test
	void calls_whenWithinTenVariablesAndTwoWeeks_thenOnePerLocation() {
		assertThat(OpenMeteoApiClient.calls(1, 1, 1, 3)).isEqualTo(1.0);
		assertThat(OpenMeteoApiClient.calls(100, 9, 1, 3)).isEqualTo(100.0);
	}

	/** Open-Meteo's own example: 15 variables over 2 weeks is 1.5 calls. */
	@Test
	void calls_whenMoreThanTenVariables_thenFractionallyMore() {
		assertThat(OpenMeteoApiClient.calls(1, 15, 1, 14)).isEqualTo(1.5);
	}

	@Test
	void calls_whenSeveralModels_thenVariablesCountedPerModel() {
		assertThat(OpenMeteoApiClient.calls(1, 8, 5, 3)).isEqualTo(4.0);
		assertThat(OpenMeteoApiClient.calls(30, 2, 5, 4)).isEqualTo(30.0);
	}

	@Test
	void calls_whenLongerThanTwoWeeks_thenFractionallyMore() {
		assertThat(OpenMeteoApiClient.calls(1, 1, 1, 21)).isEqualTo(1.5);
	}
}
