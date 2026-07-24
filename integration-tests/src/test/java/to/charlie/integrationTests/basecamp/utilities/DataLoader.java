package to.charlie.integrationTests.basecamp.utilities;

import java.io.IOException;
import java.io.InputStream;

/**
 * Loads request-body fixtures from {@code src/test/resources/data/**}, expanding any
 * {@code ${KEY:-default}} tokens against the scenario {@link Context}.
 */
public class DataLoader {

	private final Context context;

	public DataLoader(final Context context) {
		this.context = context;
	}

	public String loadData(final String fileName) {
		final ClassLoader classloader = Thread.currentThread().getContextClassLoader();
		try (final InputStream is = classloader.getResourceAsStream("data/" + fileName)) {
			if (is == null) {
				throw new IOException("Body file not found: data/" + fileName);
			}

			final String content = new String(is.readAllBytes());
			return context.replaceContent(content);
		} catch (final IOException e) {
			throw new IllegalStateException("Could not load body file: data/" + fileName, e);
		}
	}
}
