package to.charlie.basecamp.configuration;

import io.micrometer.observation.ObservationRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@RequiredArgsConstructor
public class RestClientConfiguration {

	/**
	 * The registry is what gives every request through the client an
	 * {@code http.client.requests} timer, tagged with the upstream host and URI template.
	 * Boot only does that for clients built from its own {@code RestClient.Builder}, which this
	 * app does not have.
	 */
	@Bean
	public RestClient restClient(final ObservationRegistry observationRegistry) {
		return RestClient.builder()
						.requestFactory(new BufferingClientHttpRequestFactory(new SimpleClientHttpRequestFactory()))
						.observationRegistry(observationRegistry)
						.build();
	}
}
