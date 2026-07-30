package to.charlie.basecamp.configuration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.JwkSetUriJwtDecoderBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

	/**
	 * Widens the timeouts used when the resource server fetches the provider's OIDC
	 * discovery document and JWKS.
	 * <p>
	 * Spring Security builds that decoder with {@code RestTemplateWithNimbusDefaultTimeouts},
	 * which hardcodes Nimbus's 500ms connect/read timeouts. Authentik takes ~600ms to answer
	 * the discovery endpoint, so the read times out on every attempt. The failure is opaque:
	 * the decoder never initialises, which surfaces as an {@code AuthenticationServiceException}
	 * rather than an {@code OAuth2AuthenticationException}, so every request 401s with a bare
	 * {@code WWW-Authenticate: Bearer} header and no {@code error="invalid_token"} — the token
	 * itself is never inspected. Neither {@code sun.net.client.defaultReadTimeout} nor
	 * {@code spring.http.client.*} affects it; replacing the builder's RestOperations is the
	 * only supported way in.
	 */
	@Bean
	@ConditionalOnProperty(name = "authentik.enabled", havingValue = "true")
	public JwkSetUriJwtDecoderBuilderCustomizer jwtDecoderTimeouts() {
		final SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
		requestFactory.setConnectTimeout(Duration.ofSeconds(5));
		requestFactory.setReadTimeout(Duration.ofSeconds(10));

		final RestTemplate restOperations = new RestTemplate(requestFactory);
		return builder -> builder.restOperations(restOperations);
	}

	@Bean
	@ConditionalOnProperty(name = "authentik.enabled", havingValue = "true")
	public SecurityFilterChain securityFilterChain(final HttpSecurity http) throws Exception {
		http
						.authorizeHttpRequests(auth -> auth
										.requestMatchers("/actuator/health", "/actuator/info").permitAll()
										.anyRequest().authenticated())
						.oauth2ResourceServer(oauth2 -> oauth2
										.bearerTokenResolver(tileAwareBearerTokenResolver())
										.jwt(Customizer.withDefaults()))
						.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
						.csrf(AbstractHttpConfigurer::disable);

		return http.build();
	}

	/**
	 * Accepts the access token as an {@code ?access_token=} query parameter, but only on tile
	 * requests.
	 */
	private BearerTokenResolver tileAwareBearerTokenResolver() {
		final DefaultBearerTokenResolver headerOnly = new DefaultBearerTokenResolver();

		final DefaultBearerTokenResolver withQueryParameter = new DefaultBearerTokenResolver();
		withQueryParameter.setAllowUriQueryParameter(true);

		final RequestMatcher tiles = PathPatternRequestMatcher.pathPattern(HttpMethod.GET, "/tiles/*/*/*/*.png");

		return request -> tiles.matches(request) ? withQueryParameter.resolve(request) : headerOnly.resolve(request);
	}

	@Bean
	@ConditionalOnProperty(name = "authentik.enabled", havingValue = "false", matchIfMissing = true)
	public SecurityFilterChain noAuthSecurityFilterChain(final HttpSecurity http) throws Exception {
		http
						.authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
						.csrf(AbstractHttpConfigurer::disable);

		return http.build();
	}
}
