package to.charlie.basecamp.domain.model.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import to.charlie.basecamp.domain.model.dto.workout.CreateWorkoutRequest;
import to.charlie.basecamp.domain.model.dto.workout.StatisticSummary;
import to.charlie.basecamp.domain.model.dto.workout.WorkoutEvent;
import to.charlie.basecamp.domain.model.entity.WorkoutEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutEventEntity;
import to.charlie.basecamp.domain.model.entity.WorkoutStatisticEntity;

import java.util.UUID;

/**
 * Maps the {@code POST /workouts} summary DTO onto the workout summary aggregate.
 * Persistence-managed fields (id, track status, timestamps) and associations are
 * left to the DAO/service; this mapper only translates the client-supplied values.
 */
@Mapper(componentModel = "spring")
public interface WorkoutMapper {

	@Mapping(target = "id", ignore = true)
	@Mapping(target = "trackStatus", ignore = true)
	@Mapping(target = "expectedChunks", ignore = true)
	@Mapping(target = "createdAt", ignore = true)
	@Mapping(target = "updatedAt", ignore = true)
	@Mapping(target = "sourceName", source = "source.name")
	@Mapping(target = "sourceBundleId", source = "source.bundleId")
	@Mapping(target = "sourceVersion", source = "source.version")
	@Mapping(target = "deviceName", source = "device.name")
	@Mapping(target = "deviceModel", source = "device.model")
	@Mapping(target = "deviceManufacturer", source = "device.manufacturer")
	@Mapping(target = "deviceHardwareVersion", source = "device.hardwareVersion")
	@Mapping(target = "deviceSoftwareVersion", source = "device.softwareVersion")
	WorkoutEntity toEntity(CreateWorkoutRequest request);

	@Mapping(target = "id", ignore = true)
	@Mapping(target = "workout", ignore = true)
	WorkoutStatisticEntity toStatisticEntity(StatisticSummary summary);

	@Mapping(target = "id", ignore = true)
	@Mapping(target = "workout", ignore = true)
	@Mapping(target = "chunk", ignore = true)
	@Mapping(target = "startAt", source = "start")
	@Mapping(target = "endAt", source = "end")
	WorkoutEventEntity toEventEntity(WorkoutEvent event);

	default UUID toUuid(final String value) {
		return value == null ? null : UUID.fromString(value);
	}
}
