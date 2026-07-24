package to.charlie.integrationTests.basecamp.utilities;

import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Substitutes {@code {PLACEHOLDER}} tokens in the URLs written in feature files with values a
 * scenario stored earlier in the {@link Context}. The placeholder is the context key verbatim, so
 * {@code {WORKOUT_ID}} reads {@code WORKOUT_ID}. An unresolved token is an error rather than being
 * sent literally, which turns a mistyped variable name into a clear failure.
 */
@Component
public class UrlVariableResolver {

	private static final Pattern VARIABLE = Pattern.compile("\\{([A-Za-z0-9_-]+)}");

	private final Context context;

	public UrlVariableResolver(final Context context) {
		this.context = context;
	}

	public String resolve(final String url) {
		return VARIABLE.matcher(url)
						.replaceAll(match -> Matcher.quoteReplacement(valueOf(match.group(1))));
	}

	private String valueOf(final String key) {
		final String value = context.get(key);

		if (value == null) {
			throw new IllegalStateException("No value for URL variable '{" + key + "}': nothing is stored"
							+ " in the context under that name earlier in the scenario.");
		}

		return value;
	}
}
