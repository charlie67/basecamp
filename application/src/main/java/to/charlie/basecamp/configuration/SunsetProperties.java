package to.charlie.basecamp.configuration;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.List;

@Configuration
@ConfigurationProperties(prefix = "sunset")
@Getter
@Setter
public class SunsetProperties {

	/**
	 * The weather models each sunset is scored against, by Open-Meteo's own names for them.
	 * Every one is scored separately and returned side by side, in this order.
	 */
	private List<String> models = List.of(
					"ukmo_seamless", "icon_seamless", "gfs_seamless", "ecmwf_ifs025", "meteofrance_seamless");

	/**
	 * How long fetched weather is served from the cache. The models themselves only publish a
	 * new run every one to six hours, so asking more often than this gains nothing.
	 */
	private Duration cacheTtl = Duration.ofHours(1);

	/**
	 * The one model the map overlay is scored against. It covers hundreds of points at a time,
	 * so scoring each against every model would cost several times the weather for little gain.
	 * Left unset, it is the first of {@link #models}.
	 */
	private String mapModel;

	/**
	 * How long the overlay's weather is served from the cache. Longer than for a single point:
	 * Open-Meteo counts every point of the lattice as a call against its daily allowance.
	 */
	private Duration mapCacheTtl = Duration.ofHours(3);

	/**
	 * The most lattice points one view of the overlay is scored at. The lattice gets coarser
	 * as the map zooms out to stay under this. Open-Meteo allows 600 calls a minute and counts
	 * each point as one, on top of which come the points beyond the view that the paths toward
	 * the sun cross. So this is kept to what leaves room for the map to be moved a couple of
	 * times inside a minute before it has to wait.
	 */
	private int mapMaxPoints = 200;

	public String getMapModel() {
		return mapModel != null ? mapModel : models.getFirst();
	}
}
