package to.charlie.basecamp.configuration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

	@Bean
	@ConditionalOnProperty(name = "authentik.enabled", havingValue = "true")
	public SecurityFilterChain securityFilterChain(final HttpSecurity http) throws Exception {
		http
						.authorizeHttpRequests(auth -> auth
										.requestMatchers("/actuator/health", "/actuator/info").permitAll()
										.anyRequest().authenticated())
						.oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
						.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
						.csrf(AbstractHttpConfigurer::disable);

		return http.build();
	}
}
