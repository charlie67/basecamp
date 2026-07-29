package to.charlie.basecamp.domain.service;

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
import to.charlie.basecamp.infrastructure.rest.client.OsMapsApiClient;

@Service
@RequiredArgsConstructor
@Slf4j
public class MapTileService {

	private final OsMapsApiClient osMapsApiClient;
	private final S3Client s3Client;
	private final S3Properties s3Properties;

	public ResponseEntity<byte[]> getMapTile(final String map, final int z, final int x, final int y) {

		final String key = String.format("%s/%d/%d/%d.png", map, z, x, y);

		final byte[] cachedTile = getCachedTile(key);
		if (cachedTile != null) {
			log.info("Serving map tile from S3 cache: {}", key);
			return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(cachedTile);
		}

		log.info("Map tile not in S3 cache: {} - fetching from OS Maps", key);

		final ResponseEntity<byte[]> response = osMapsApiClient.getTile(map, z, x, y);

		if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
			log.info("Successfully received map tile: {}/{}/{}/{} - saving in S3", map, z, x, y);
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

	private byte[] getCachedTile(final String key) {
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
			log.warn("Failed to read map tile from S3 cache: {} - falling back to OS Maps", key, e);
			return null;
		}
	}
}
