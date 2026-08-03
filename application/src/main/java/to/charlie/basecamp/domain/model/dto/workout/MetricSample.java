package to.charlie.basecamp.domain.model.dto.workout;

import java.time.Instant;

/**
 * One sample of a workout's time series, as the charts want it: the interval it covers, and the
 * value over that interval.
 *
 * <p>{@code e} equals {@code t} for the instantaneous readings a watch sends live. It is wider —
 * up to a quarter of an hour — on older exports, which sent one value averaged over each track
 * chunk rather than the beats behind it. A reader that ignored it would plot those few values as
 * isolated points and leave the rest of the walk blank.
 *
 * <p>Deliberately not {@link SeriesPoint}, which is the ingest shape. The names are kept to a
 * single character each because a long walk sends a few hundred of these and the keys repeat on
 * every one.
 */
public record MetricSample(
        Instant t,
        Instant e,
        double v
) {}
