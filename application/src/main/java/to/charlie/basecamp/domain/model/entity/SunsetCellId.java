package to.charlie.basecamp.domain.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import to.charlie.basecamp.domain.model.SunEvent;

import java.io.Serializable;

/**
 * Key for {@link SunsetWeatherEntity}: a tenth-of-a-degree grid cell, roughly 11km by 7km over
 * Britain, and which of the sunset and sunrise there the weather was fetched for.
 *
 * <p>Kept as whole tenths rather than as the degrees themselves so that the key is exact. The
 * weather models are no finer than a few kilometres, so every click inside one cell would get
 * the same forecast anyway, and this is what lets them share a cache row.
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class SunsetCellId implements Serializable {

	private static final double CELLS_PER_DEGREE = 10.0;

	@Column(name = "lat_tenths", nullable = false)
	private int latTenths;

	@Column(name = "lon_tenths", nullable = false)
	private int lonTenths;

	@Enumerated(EnumType.STRING)
	@Column(name = "event", nullable = false)
	private SunEvent event;

	public static SunsetCellId containing(final double lat, final double lon, final SunEvent event) {
		return new SunsetCellId((int) Math.round(lat * CELLS_PER_DEGREE), (int) Math.round(lon * CELLS_PER_DEGREE), event);
	}

	/** The centre of the cell, which is the point its weather is fetched for. */
	public double lat() {
		return latTenths / CELLS_PER_DEGREE;
	}

	public double lon() {
		return lonTenths / CELLS_PER_DEGREE;
	}
}
