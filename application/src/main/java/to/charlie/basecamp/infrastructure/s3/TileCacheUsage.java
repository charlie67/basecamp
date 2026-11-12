package to.charlie.basecamp.infrastructure.s3;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.MultiGauge;
import io.micrometer.core.instrument.Tags;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.S3Object;
import to.charlie.basecamp.configuration.S3Properties;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * How much of the bucket the tile cache takes up, by provider, map and zoom level. S3 has no
 * way to ask that short of listing every object, so it is listed in the background now and
 * again and the last answer is what the gauges report.
 */
@Component
@Slf4j
public class TileCacheUsage {

	/** One provider, map and zoom level's share of the cache. Keys are {@code provider/map/z/x/y.png}. */
	private record Level(String provider, String map, String zoom) {

		static Level of(final String key) {
			final String[] parts = key.split("/", 4);
			return parts.length == 4 ? new Level(parts[0], parts[1], parts[2]) : new Level("other", "other", "other");
		}

		Tags tags() {
			return Tags.of("provider", provider, "map", map, "zoom", zoom);
		}
	}

	private final S3Client s3Client;
	private final S3Properties s3Properties;
	private final MultiGauge objects;
	private final MultiGauge size;
	private final AtomicLong refreshedAt = new AtomicLong();

	public TileCacheUsage(final S3Client s3Client, final S3Properties s3Properties, final MeterRegistry meterRegistry) {
		this.s3Client = s3Client;
		this.s3Properties = s3Properties;
		this.objects = MultiGauge.builder("basecamp.tiles.cache.objects")
						.description("Map tiles held in the S3 cache, as of the last time it was listed")
						.register(meterRegistry);
		this.size = MultiGauge.builder("basecamp.tiles.cache.size")
						.description("Bytes the S3 tile cache holds, as of the last time it was listed")
						.baseUnit("bytes")
						.register(meterRegistry);
		Gauge.builder("basecamp.tiles.cache.listed", refreshedAt, AtomicLong::get)
						.description("When the S3 tile cache was last listed, in unix seconds")
						.baseUnit("seconds")
						.register(meterRegistry);
	}

	@Scheduled(initialDelayString = "PT1M", fixedDelayString = "${s3.usage-refresh-interval:PT30M}")
	public void refresh() {
		final Map<Level, long[]> usage = new HashMap<>();
		try {
			for (final S3Object object : s3Client.listObjectsV2Paginator(request -> request.bucket(s3Properties.getBucket())).contents()) {
				final long[] totals = usage.computeIfAbsent(Level.of(object.key()), level -> new long[2]);
				totals[0]++;
				totals[1] += object.size();
			}
		} catch (final SdkException e) {
			// The gauges keep the last answer, and how old it is shows in basecamp.tiles.cache.listed.
			log.warn("Failed to list the S3 tile cache", e);
			return;
		}

		final List<MultiGauge.Row<?>> objectRows = new ArrayList<>();
		final List<MultiGauge.Row<?>> sizeRows = new ArrayList<>();
		usage.forEach((level, totals) -> {
			objectRows.add(MultiGauge.Row.of(level.tags(), totals[0]));
			sizeRows.add(MultiGauge.Row.of(level.tags(), totals[1]));
		});
		objects.register(objectRows, true);
		size.register(sizeRows, true);
		refreshedAt.set(Instant.now().getEpochSecond());
		log.info("Listed the S3 tile cache: {} levels", usage.size());
	}
}
