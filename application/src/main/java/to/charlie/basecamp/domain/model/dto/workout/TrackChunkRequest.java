package to.charlie.basecamp.domain.model.dto.workout;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TrackChunkRequest(
        String healthkitUuid,
        int sequence,
        int chunkCount,
        @JsonProperty("final") boolean isFinal,
        Instant start,
        Instant end,
        List<RoutePoint> route,
        Map<String, List<SeriesPoint>> series,
        List<WorkoutEvent> events
) {}
