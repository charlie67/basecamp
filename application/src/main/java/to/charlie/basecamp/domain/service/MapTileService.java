package to.charlie.basecamp.domain.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import to.charlie.basecamp.configuration.S3Properties;
import to.charlie.basecamp.domain.model.ProviderEnum;
import to.charlie.basecamp.infrastructure.rest.client.MapBoxApiClient;
import to.charlie.basecamp.infrastructure.rest.client.OsMapsApiClient;

@Service
@RequiredArgsConstructor
@Slf4j
public class MapTileService {

	private final OsMapsApiClient osMapsApiClient;
	private final MapBoxApiClient mapBoxApiClient;
	private final S3Client s3Client;
	private final S3Properties s3Properties;
	private final MeterRegistry meterRegistry;

	public ResponseEntity<byte[]> getMapTile(final ProviderEnum provider, final String map, final int z, final int x, final int y) {

		final String key = String.format("%s/%s/%d/%d/%d.png", provider, map, z, x, y);

		final byte[] cachedTile = getCachedTile(provider, key);
		if (cachedTile != null) {
			log.info("Serving map tile from S3 cache: {}", key);
			countRequest(provider, "hit");
			countBytes(provider, "cache", cachedTile.length);
			return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(cachedTile);
		}

		log.info("Map tile not in S3 cache: {} - fetching from {}", key, provider);
		// Counted before the fetch, so a tile the provider then fails to send is still a miss.
		countRequest(provider, "miss");

		final ResponseEntity<byte[]> response = switch (provider) {
			case MAP_BOX -> mapBoxApiClient.getTile(map, z, x, y);
			case OS_MAPS -> osMapsApiClient.getTile(map, z, x, y);
		};

		if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
			countBytes(provider, "provider", response.getBody().length);
			log.info("Successfully received map tile: {}/{}/{}/{}/{} - saving in S3", provider, map, z, x, y);
			s3Client.putObject(
							PutObjectRequest.builder()
											.bucket(s3Properties.getBucket())
											.key(key)
											.contentType(MediaType.IMAGE_PNG_VALUE)
											.build(), RequestBody.fromBytes(response.getBody()));
		} else {
			log.error("Received error when getting map tile: {}/{}/{}/{} - status={}", map, z, x, y, response.getStatusCode());
		}

		return response;
	}

	/** A tile asked for, by whether the cache had it. One the cache could not be read for is a miss. */
	private void countRequest(final ProviderEnum provider, final String result) {
		Counter.builder("basecamp.tiles.requests")
						.description("Map tiles asked for, by whether the S3 cache had them")
						.tag("provider", provider.name())
						.tag("result", result)
						.register(meterRegistry)
						.increment();
	}

	private void countBytes(final ProviderEnum provider, final String source, final long bytes) {
		Counter.builder("basecamp.tiles.bytes")
						.description("Map tile bytes served, by whether they came from the cache or the provider")
						.baseUnit("bytes")
						.tag("provider", provider.name())
						.tag("source", source)
						.register(meterRegistry)
						.increment(bytes);
	}

	private byte[] getCachedTile(final ProviderEnum provider, final String key) {
		try {
			return s3Client.getObjectAsBytes(
											GetObjectRequest.builder()
															.bucket(s3Properties.getBucket())
															.key(key)
															.build())
							.asByteArray();
		} catch (final NoSuchKeyException e) {
			log.debug("Map tile not in S3 cache: {}", key);
			return null;
		} catch (final RuntimeException e) {
			log.warn("Failed to read map tile from S3 cache: {} - falling back to {}", key, provider, e);
			Counter.builder("basecamp.tiles.cache.read.errors")
							.description("Map tiles the S3 cache could not be read for")
							.tag("provider", provider.name())
							.register(meterRegistry)
							.increment();
			return null;
		}
	}
}
