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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/**
 * Workout event (lap, pause, …). Arrives in either the summary or a track chunk;
 * {@code chunk} is null for summary events and set for chunk events, so a retried
 * chunk's events can be deleted by {@code chunk_id} and re-inserted.
 */
@Entity
@Table(name = "workout_event", indexes = @Index(name = "idx_workout_event_workout_start", columnList = "workout_id, start_at"))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkoutEventEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "id", nullable = false, updatable = false)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "workout_id", nullable = false)
	private WorkoutEntity workout;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "chunk_id")
	private TrackChunkEntity chunk;

	@Column(name = "type")
	private String type;

	@Column(name = "start_at")
	private Instant startAt;

	@Column(name = "end_at")
	private Instant endAt;

	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "metadata")
	private Map<String, Object> metadata;
}
