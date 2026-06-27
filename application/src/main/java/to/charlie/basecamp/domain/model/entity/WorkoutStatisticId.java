package to.charlie.basecamp.domain.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.UUID;

/**
 * Composite key for {@link WorkoutStatisticEntity}: one row per (workout, metric name).
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class WorkoutStatisticId implements Serializable {

	@Column(name = "workout_id", nullable = false)
	private UUID workoutId;

	@Column(name = "name", nullable = false)
	private String name;
}
