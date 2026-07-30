package to.charlie.basecamp.infrastructure.rest.client;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import to.charlie.basecamp.configuration.MapBoxProperties;

@Component
@RequiredArgsConstructor
public class MapBoxApiClient {

	private final RestClient restClient;
	private final MapBoxProperties mapBoxProperties;

	public ResponseEntity<byte[]> getTile(final String map, final int z, final int x, final int y) {

		return restClient.get()
						.uri(mapBoxProperties.getApiUrl() + "/{map}/tiles/512/{z}/{x}/{y}@2x?access_token={key}",
										map, z, x, y, mapBoxProperties.getApiKey())
						.retrieve()
						.toEntity(byte[].class);
	}
}
