package to.charlie.basecamp.domain.model.dto.workout;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record CreateWorkoutRequest(
        String healthkitUuid,
        String type,
        Instant startDate,
        Instant endDate,
        double durationSeconds,
        Double distanceM,
        Double elevationGainM,
        Double elevationLossM,
        Double activeCalories,
        Double basalCalories,
        int routePointCount,
        String contentHash,
        /// Null from clients that pre-date the field; stored as-is so it reads as stale.
        Integer extractionVersion,
        WorkoutSource source,
        WorkoutDevice device,
        Map<String, Object> metadata,
        Map<String, StatisticSummary> statistics,
        List<WorkoutEvent> events
) {}
