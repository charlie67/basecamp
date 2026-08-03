package to.charlie.basecamp.infrastructure.dal.projection;

import java.time.Instant;

/**
 * One thinned {@code series_point} read straight onto the wire shape.
 *
 * <p>Same reasoning as {@link RoutePointProjection}: a workout's heart rate alone runs to a few
 * thousand samples, and hydrating those as managed entities — with lazy proxies for
 * {@code workout} and {@code chunk} — costs far more than the two columns anyone reads.
 *
 * <p>Both ends of the sample are carried, because the span is not always zero. A watch that
 * reports instantaneous beats sends {@code end_at == start_at}, but older exports send one value
 * averaged over each track chunk — a quarter of an hour wide. A chart given only the start would
 * draw those as isolated dots with nothing in between, so the reader needs to know what interval
 * the value stands for.
 */
public interface MetricSampleProjection {

	Instant getT();

	Instant getE();

	double getValue();
}
