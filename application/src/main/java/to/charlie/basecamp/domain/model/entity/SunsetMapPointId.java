package to.charlie.basecamp.domain.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

import java.io.Serializable;

/**
 * Key for {@link SunsetMapWeatherEntity}: one point of the lattice the map overlay is scored
 * on, in whole hundredths of a degree so that the key is exact.
 *
 * <p>Every lattice step is a whole number of hundredths, so a point belongs to each lattice
 * whose step divides it, and the coarse lattices reuse the fine ones' rows.
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
@ToString
public class SunsetMapPointId implements Serializable {

	private static final int HALF_TURN = 18_000;

	@Column(name = "lat_hundredths", nullable = false)
	private int latHundredths;

	@Column(name = "lon_hundredths", nullable = false)
	private int lonHundredths;

	/** Longitude is wrapped into [-180, 180), so a point reached across the antimeridian is the same row. */
	public static SunsetMapPointId of(final int latHundredths, final int lonHundredths) {
		return new SunsetMapPointId(latHundredths, Math.floorMod(lonHundredths + HALF_TURN, 2 * HALF_TURN) - HALF_TURN);
	}

	public double lat() {
		return latHundredths / 100.0;
	}

	public double lon() {
		return lonHundredths / 100.0;
	}
}
