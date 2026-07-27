package to.charlie.basecamp.domain.model.dto.workout;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Builder
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record WorkoutSummaryResponse(
        UUID id,
        String type,
        Instant startDate,
        Instant endDate,
        List<RoutePoint> routePoints
) {}
