package to.charlie.basecamp.domain.model.dto.workout;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;
import to.charlie.basecamp.domain.model.entity.TrackStatus;

import java.util.UUID;

/**
 * What the server already holds for one workout, so a client can decide whether to upload at all.
 *
 * <p>Deliberately structural — ids, versions, counts and a status. Nothing here is derived from
 * sample values, because a checksum over the stored track could not be reproduced by the client:
 * the doubles and timestamps do not survive the round-trip through Postgres byte-for-byte, so any
 * such comparison would report a mismatch on data that is in fact identical.
 *
 * @param contentHash       the hash the client sent with the summary, echoed back
 * @param extractionVersion how the stored track was extracted; null pre-dates the field and should
 *                          be read as stale
 * @param expectedChunks    how many chunks the last upload said the track would have
 * @param receivedChunks    how many are actually stored — equal to {@code expectedChunks} only when
 *                          the track upload ran to completion
 */
@Builder
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record WorkoutManifestResponse(
        UUID id,
        UUID healthkitUuid,
        String contentHash,
        Integer extractionVersion,
        TrackStatus trackStatus,
        Integer expectedChunks,
        long receivedChunks,
        int routePointCount
) {}
