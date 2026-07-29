package to.charlie.basecamp.domain.model.dto.workout;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Builder
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record WorkoutSummaryResponse(
        UUID id,
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
        // Keyed by metric name as stored (heart_rate, active_energy_burned, ...);
        // the snake_case naming strategy applies to fields, not map keys.
        Map<String, StatisticSummary> statistics,
        List<RoutePoint> routePoints
) {}
