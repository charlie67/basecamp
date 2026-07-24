package to.charlie.basecamp.infrastructure.rest.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allows the local frontend dev server to call the API during development.
 */
@Configuration
public class WebCorsConfig implements WebMvcConfigurer {

	@Override
	public void addCorsMappings(final CorsRegistry registry) {
		registry.addMapping("/**")
						.allowedOrigins("http://localhost:3000", "http://localhost:5173")
						.allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
	}
}
