package to.charlie.basecamp.domain.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Workout summary. One row per HealthKit workout, upsert key {@code healthkit_uuid}.
 */
@Entity
@Table(
				name = "workout",
				uniqueConstraints = @UniqueConstraint(name = "uq_workout_type_start", columnNames = {"type", "start_date"})
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkoutEntity {

	@Id
	@Column(name = "id", nullable = false, updatable = false)
	private UUID id;

	@Column(name = "healthkit_uuid", nullable = false, unique = true, updatable = false)
	private UUID healthkitUuid;

	@Column(name = "type")
	private String type;

	@Column(name = "start_date")
	private Instant startDate;

	@Column(name = "end_date")
	private Instant endDate;

	@Column(name = "duration_seconds")
	private double durationSeconds;

	@Column(name = "distance_m")
	private Double distanceM;

	@Column(name = "elevation_gain_m")
	private Double elevationGainM;

	@Column(name = "elevation_loss_m")
	private Double elevationLossM;

	@Column(name = "active_calories")
	private Double activeCalories;

	@Column(name = "basal_calories")
	private Double basalCalories;

	@Column(name = "route_point_count")
	private int routePointCount;

	@Column(name = "content_hash")
	private String contentHash;

	@Column(name = "source_name")
	private String sourceName;

	@Column(name = "source_bundle_id")
	private String sourceBundleId;

	@Column(name = "source_version")
	private String sourceVersion;

	@Column(name = "device_name")
	private String deviceName;

	@Column(name = "device_model")
	private String deviceModel;

	@Column(name = "device_manufacturer")
	private String deviceManufacturer;

	@Column(name = "device_hardware_version")
	private String deviceHardwareVersion;

	@Column(name = "device_software_version")
	private String deviceSoftwareVersion;

	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "metadata")
	private Map<String, Object> metadata;

	@Enumerated(EnumType.STRING)
	@Column(name = "track_status", nullable = false)
	private TrackStatus trackStatus;

	@Column(name = "expected_chunks")
	private Integer expectedChunks;

	@CreationTimestamp
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@UpdateTimestamp
	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;
}
