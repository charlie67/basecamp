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
import java.util.List;
import java.util.Map;

/**
 * The weather last fetched for one grid cell, as Open-Meteo returned it.
 *
 * <p>The raw responses are what is cached, not the scores worked out from them: scoring is
 * cheap, and this way a change to the scoring shows up at once rather than after the cache
 * has turned over.
 */
@Entity
@Table(name = "sunset_weather")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SunsetWeatherEntity {

	@EmbeddedId
	private SunsetCellId id;

	@Column(name = "fetched_at", nullable = false)
	private Instant fetchedAt;

	/** The models the responses below were asked for, so a change to the list refetches. */
	@Column(name = "models", nullable = false)
	private String models;

	/** Hourly weather and the sunset times at the cell itself. */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "forecast", nullable = false)
	private Map<String, Object> forecast;

	/** Cloud at each point along each day's sunset bearing, days in order and nearest first. */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "path", nullable = false)
	private List<Map<String, Object>> path;

	/** Null when the air quality request failed; the score goes ahead without it. */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "aerosols")
	private Map<String, Object> aerosols;
}
