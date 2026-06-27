package to.charlie.basecamp.domain.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * Track chunk header and idempotency ledger. {@code (workout_id, sequence)} is unique,
 * enforcing the {@code uuid:sequence} idempotency key in the database.
 */
@Entity
@Table(
				name = "track_chunk",
				uniqueConstraints = @UniqueConstraint(name = "uq_track_chunk_workout_sequence", columnNames = {"workout_id", "sequence"})
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrackChunkEntity {

	@Id
	@UuidGenerator
	@Column(name = "id", nullable = false, updatable = false)
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "workout_id", nullable = false)
	private WorkoutEntity workout;

	@Column(name = "sequence", nullable = false)
	private int sequence;

	@Column(name = "chunk_count", nullable = false)
	private int chunkCount;

	@Column(name = "is_final", nullable = false)
	private boolean isFinal;

	@Column(name = "start_at")
	private Instant startAt;

	@Column(name = "end_at")
	private Instant endAt;

	@CreationTimestamp
	@Column(name = "received_at", nullable = false, updatable = false)
	private Instant receivedAt;
}
