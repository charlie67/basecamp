package to.charlie.basecamp.domain.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * A single GPS sample from a track chunk's {@code route}. High volume.
 */
@Entity
@Table(name = "route_point", indexes = @Index(name = "idx_route_point_workout_t", columnList = "workout_id, t"))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoutePointEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "id", nullable = false, updatable = false)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "workout_id", nullable = false)
	private WorkoutEntity workout;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "chunk_id", nullable = false)
	private TrackChunkEntity chunk;

	@Column(name = "t")
	private Instant t;

	@Column(name = "lat")
	private double lat;

	@Column(name = "lon")
	private double lon;

	@Column(name = "altitude_m")
	private double altitudeM;

	@Column(name = "ellipsoidal_altitude_m")
	private double ellipsoidalAltitudeM;

	@Column(name = "horizontal_accuracy_m")
	private double horizontalAccuracyM;

	@Column(name = "vertical_accuracy_m")
	private double verticalAccuracyM;

	@Column(name = "speed_mps")
	private double speedMps;

	@Column(name = "speed_accuracy_mps")
	private double speedAccuracyMps;

	@Column(name = "course_deg")
	private double courseDeg;

	@Column(name = "course_accuracy_deg")
	private double courseAccuracyDeg;
}
