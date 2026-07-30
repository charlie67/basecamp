package to.charlie.basecamp.infrastructure.s3;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import to.charlie.basecamp.configuration.S3Properties;

import java.net.URI;

@Configuration
public class S3Config {

	@Bean
	public S3Client s3Client(final S3Properties s3Properties) {
		final var builder = S3Client.builder()
						.region(Region.of(s3Properties.getRegion()))
						.credentialsProvider(StaticCredentialsProvider.create(
										AwsBasicCredentials.create(
														s3Properties.getAccessKey(),
														s3Properties.getSecretKey()
										)
						));

		if (s3Properties.getEndpoint() != null && !s3Properties.getEndpoint().isBlank()) {
			builder.endpointOverride(URI.create(s3Properties.getEndpoint()));
		}

		if (s3Properties.isPathStyleAccess()) {
			builder.forcePathStyle(true);
		}

		return builder.build();
	}
}