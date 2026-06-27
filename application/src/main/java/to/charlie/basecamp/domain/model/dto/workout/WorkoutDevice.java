package to.charlie.basecamp.domain.model.dto.workout;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record WorkoutDevice(
        String name,
        String model,
        String manufacturer,
        String hardwareVersion,
        String softwareVersion
) {}
