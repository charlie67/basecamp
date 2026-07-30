package to.charlie.basecamp.configuration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import to.charlie.basecamp.domain.model.ProviderEnum;
import to.charlie.basecamp.domain.service.MapTileService;
import to.charlie.basecamp.infrastructure.rest.controllers.MapTileController;

import java.time.Instant;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers the one asymmetry in the filter chain: tiles accept the access token as a query
 * parameter (Leaflet loads them as {@code <img>} and cannot set a header), and nothing else does.
 */
@WebMvcTest(controllers = MapTileController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = {
				"authentik.enabled=true",
				"spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:9000/application/o/basecamp/",
})
class SecurityConfigTest {

	private static final String TILE = "/tiles/MAP_BOX/satellite-v9/7/62/40.png";
	private static final String TOKEN = "a.valid.token";

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private JwtDecoder jwtDecoder;

	@MockitoBean
	private MapTileService mapTileService;

	@BeforeEach
	void stubTokenAndTile() {
		when(jwtDecoder.decode(TOKEN)).thenReturn(Jwt.withTokenValue(TOKEN)
						.header("alg", "RS256")
						.subject("charlie")
						.issuedAt(Instant.now())
						.expiresAt(Instant.now().plusSeconds(300))
						.build());
		when(jwtDecoder.decode("not.a.token")).thenThrow(new BadJwtException("invalid signature"));

		when(mapTileService.getMapTile(any(ProviderEnum.class), anyString(), anyInt(), anyInt(), anyInt()))
						.thenReturn(ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(new byte[]{1, 2, 3}));
	}

	@Test
	void securityFilterChain_whenTileRequestHasNoToken_thenReturnsUnauthorized() throws Exception {
		mockMvc.perform(get(TILE)).andExpect(status().isUnauthorized());
	}

	@Test
	void securityFilterChain_whenTileTokenInQueryParameter_thenServesTile() throws Exception {
		mockMvc.perform(get(TILE).param("access_token", TOKEN)).andExpect(status().isOk());
	}

	@Test
	void securityFilterChain_whenTileTokenInAuthorizationHeader_thenServesTile() throws Exception {
		mockMvc.perform(get(TILE).header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN))
						.andExpect(status().isOk());
	}

	@Test
	void securityFilterChain_whenTileTokenIsInvalid_thenReturnsUnauthorized() throws Exception {
		mockMvc.perform(get(TILE).param("access_token", "not.a.token")).andExpect(status().isUnauthorized());
	}

	/**
	 * The important one: enabling the query parameter on the resolver Spring Security applies to
	 * every request would let credentials travel in the URL across the whole API.
	 */
	@Test
	void securityFilterChain_whenTokenInQueryParameterOnNonTileEndpoint_thenReturnsUnauthorized() throws Exception {
		mockMvc.perform(get("/workouts").param("access_token", TOKEN)).andExpect(status().isUnauthorized());
	}
}
