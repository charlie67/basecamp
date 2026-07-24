package to.charlie.integrationTests.basecamp.steps;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.client.methods.HttpUriRequest;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClientBuilder;
import org.apache.http.util.EntityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import to.charlie.integrationTests.basecamp.utilities.Context;
import to.charlie.integrationTests.basecamp.utilities.DataLoader;
import to.charlie.integrationTests.basecamp.utilities.Ports;
import to.charlie.integrationTests.basecamp.utilities.UrlVariableResolver;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Generic HTTP steps: they turn Gherkin sentences into real requests against the running app and
 * stash the status and body in the {@link Context} for the assertion steps. Adding a scenario means
 * writing Gherkin and JSON fixtures, not Java.
 */
public class HttpSteps {

	@Autowired
	private DataLoader loader;

	@Autowired
	private Context context;

	@Autowired
	private UrlVariableResolver urlVariableResolver;

	private final CloseableHttpClient client = HttpClientBuilder.create().build();

	private final ObjectMapper mapper = new ObjectMapper();

	@When("I send an HTTP {word} request to {string}")
	public void sendHttpRequest(final String method, final String url) throws Exception {
		send(method, url, "");
	}

	@When("I send an HTTP {word} request to {string} with the body from file: {string}")
	public void sendHttpRequestWithBodyFile(final String method, final String url, final String bodyFile)
					throws Exception {
		send(method, url, loader.loadData(bodyFile));
	}

	/**
	 * Sends the body of the previous response back to the API — the create-from-summary flow, where
	 * one endpoint's response becomes the next request's payload.
	 */
	@When("I send an HTTP {word} request to {string} with the previous response body")
	public void sendHttpRequestWithPreviousResponseBody(final String method, final String url) throws Exception {
		send(method, url, context.get("RESPONSE_BODY"));
	}

	private void send(final String method, final String url, final String body) throws Exception {
		final String builtUrl = "http://localhost:" + Ports.SPRING + urlVariableResolver.resolve(url);

		final HttpUriRequest request;
		if (method.equalsIgnoreCase("GET")) {
			request = new HttpGet(builtUrl);
		} else if (method.equalsIgnoreCase("POST")) {
			final HttpPost post = new HttpPost(builtUrl);
			post.setEntity(new StringEntity(body == null ? "" : body, ContentType.APPLICATION_JSON));
			request = post;
		} else {
			throw new UnsupportedOperationException("HTTP method not supported: " + method);
		}

		try (final CloseableHttpResponse response = client.execute(request)) {
			context.set("RESPONSE_STATUS", String.valueOf(response.getStatusLine().getStatusCode()));
			final String responseBody = response.getEntity() == null ? ""
							: EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
			context.set("RESPONSE_BODY", responseBody);
		}
	}

	@Then("the response body should contain the following fields:")
	public void theResponseBodyShouldContainTheFollowingFields(final DataTable table) {
		final DocumentContext document = JsonPath.parse(context.get("RESPONSE_BODY"));

		for (final List<String> row : table.asLists(String.class)) {
			final String jsonPath = row.get(0);
			// Resolve {KEY} tokens so an expected value can reference something stored earlier
			// (e.g. asserting a re-posted workout keeps the same id).
			final String expectedValue = urlVariableResolver.resolve(row.get(1));

			final Object read = document.read(jsonPath);
			final String actualValue = read == null ? null : String.valueOf(read);

			if (actualValue == null) {
				throw new AssertionError("Expected value for JSON path '" + jsonPath + "' not found in body.");
			}

			if (expectedValue.equals("<valid_uuid>")) {
				UUID.fromString(actualValue);
			} else {
				assertEquals(expectedValue, actualValue,
								"Mismatch for JSON path '" + jsonPath + "'");
			}
		}
	}

	@Then("I store the value of {string} from the HTTP response as {string}")
	public void iStoreTheValueOfFromTheResponseAs(final String jsonPath, final String key) throws Exception {
		final Map<String, Object> json = mapper.readValue(context.get("RESPONSE_BODY"), new TypeReference<>() {
		});
		final Object value = getValueByPath(json, jsonPath);

		context.set(key, String.valueOf(value));
	}

	@SuppressWarnings("unchecked")
	private static Object getValueByPath(final Map<String, Object> obj, final String path) {
		Object current = obj;
		for (final String key : path.split("\\.")) {
			if (current instanceof Map) {
				current = ((Map<String, Object>) current).get(key);
			} else {
				return null;
			}
		}
		return current;
	}
}
