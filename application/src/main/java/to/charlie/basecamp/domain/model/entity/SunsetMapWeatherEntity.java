package to.charlie.basecamp.domain.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/**
 * The weather last fetched for one point of the map overlay's lattice, as Open-Meteo returned
 * it. Raw rather than scored, for the same reason as {@link SunsetWeatherEntity}.
 */
@Entity
@Table(name = "sunset_map_weather")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SunsetMapWeatherEntity {

	@EmbeddedId
	private SunsetMapPointId id;

	@Column(name = "fetched_at", nullable = false)
	private Instant fetchedAt;

	/** The model the forecast was asked for, so a change of model refetches. */
	@Column(name = "model", nullable = false)
	private String model;

	/** Hourly weather and the sunset times at the point. */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "forecast", nullable = false)
	private Map<String, Object> forecast;
}
