package to.charlie.basecamp.configuration;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "s3")
@Getter
@Setter
public class S3Properties {
	private String endpoint;
	private String accessKey;
	private String secretKey;
	private String region;
	private String bucket;
	private boolean pathStyleAccess;
}