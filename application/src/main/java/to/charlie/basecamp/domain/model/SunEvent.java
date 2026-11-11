package to.charlie.basecamp.domain.model;

import java.util.Arrays;
import java.util.Optional;

/**
 * Which end of the day is being forecast. The two are scored the same way and differ only in
 * when the sun is on the horizon and in which direction: a sunrise is a sunset mirrored east.
 *
 * <p>Much of the code is named for the sunset, which came first.
 */
public enum SunEvent {
	SUNSET("sunset"),
	SUNRISE("sunrise");

	private final String variable;

	SunEvent(final String variable) {
		this.variable = variable;
	}

	/** Open-Meteo's name for the daily variable holding the time, which is also the word for it in prose and in URLs. */
	public String variable() {
		return variable;
	}

	public static Optional<SunEvent> of(final String variable) {
		return Arrays.stream(values()).filter(event -> event.variable.equals(variable)).findFirst();
	}
}
