package to.charlie.basecamp.domain.model.dto.workout;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import java.time.Instant;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record RoutePoint(
        Instant t,
        double lat,
        double lon,
        double altitudeM,
        double ellipsoidalAltitudeM,
        double horizontalAccuracyM,
        double verticalAccuracyM,
        double speedMps,
        double speedAccuracyMps,
        double courseDeg,
        double courseAccuracyDeg
) {}
