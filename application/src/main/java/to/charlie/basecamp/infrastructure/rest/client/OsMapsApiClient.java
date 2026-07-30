package to.charlie.basecamp.infrastructure.rest.client;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import to.charlie.basecamp.configuration.OsMapsConfiguration;

@Component
@RequiredArgsConstructor
public class OsMapsApiClient {

	private final RestClient restClient;
	private final OsMapsConfiguration osMapsConfiguration;

	public ResponseEntity<byte[]> getTile(final String map, final int z, final int x, final int y) {

		return restClient.get()
						.uri(osMapsConfiguration.getApiUrl() + "/{map}/{z}/{x}/{y}.png?key={key}",
										map, z, x, y, osMapsConfiguration.getApiKey())
						.retrieve()
						.toEntity(byte[].class);
	}
}
