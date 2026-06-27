package to.charlie.basecamp.domain.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Per-metric summary aggregate from the workout {@code statistics} map.
 */
@Entity
@Table(name = "workout_statistic")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkoutStatisticEntity {

	@EmbeddedId
	private WorkoutStatisticId id;

	@MapsId("workoutId")
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "workout_id", nullable = false)
	private WorkoutEntity workout;

	@Column(name = "min")
	private double min;

	@Column(name = "max")
	private double max;

	@Column(name = "avg")
	private double avg;

	@Column(name = "sum")
	private double sum;

	@Column(name = "unit")
	private String unit;
}
