package to.charlie.integrationTests.basecamp.utilities;

import java.util.HashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A per-scenario key/value scratchpad. Steps store things here (a created workout id, an expected
 * value) and later steps read them back, so scenarios can chain requests without Java glue.
 */
public class Context {

	private final HashMap<String, String> context = new HashMap<>();

	public String set(final String key, final String value) {
		return context.put(key, value);
	}

	public String get(final String key) {
		return context.get(key);
	}

	/**
	 * Replaces {@code ${KEY:-default}} tokens in loaded file content with the stored value for
	 * {@code KEY}, falling back to {@code default} when nothing is stored.
	 */
	public String replaceContent(String content) {
		final String regex = "\\$\\{([^}]+):-([^}]+)}";

		final Pattern pattern = Pattern.compile(regex);
		final Matcher matcher = pattern.matcher(content);

		while (matcher.find()) {
			final String fullMatch = matcher.group(0);
			final String keyName = matcher.group(1);

			String replaceValue = matcher.group(2);
			if (context.containsKey(keyName)) {
				replaceValue = context.get(keyName);
			}

			content = content.replace(fullMatch, replaceValue);
		}

		return content;
	}
}
