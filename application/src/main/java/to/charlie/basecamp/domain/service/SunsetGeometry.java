package to.charlie.basecamp.domain.service;

import to.charlie.basecamp.domain.model.SunEvent;

import java.time.LocalDate;

/**
 * Where the sun sets and rises, and what lies in that direction.
 */
final class SunsetGeometry {

	private static final double EARTH_RADIUS_KM = 6371.0;
	private static final double AXIAL_TILT_DEGREES = 23.44;

	private SunsetGeometry() {
	}

	/** Compass bearing of the sun as it sets, degrees from north, from the date's solar declination. */
	static double sunsetAzimuth(final double lat, final LocalDate date) {
		final double declination = Math.toRadians(
						-AXIAL_TILT_DEGREES * Math.cos(2 * Math.PI / 365 * (date.getDayOfYear() + 10)));
		final double cosAzimuth = Math.sin(declination) / Math.cos(Math.toRadians(lat));
		return 360 - Math.toDegrees(Math.acos(Math.clamp(cosAzimuth, -1.0, 1.0)));
	}

	/** Compass bearing of the sun as it sets or rises. The two mirror each other about due north. */
	static double azimuth(final SunEvent event, final double lat, final LocalDate date) {
		final double sunset = sunsetAzimuth(lat, date);
		return event == SunEvent.SUNRISE ? 360 - sunset : sunset;
	}

	/** The point reached by travelling {@code km} from (lat, lon) along {@code bearing}, as [lat, lon]. */
	static double[] destination(final double lat, final double lon, final double bearing, final double km) {
		final double lat1 = Math.toRadians(lat);
		final double lon1 = Math.toRadians(lon);
		final double b = Math.toRadians(bearing);
		final double d = km / EARTH_RADIUS_KM;

		final double lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
		final double lon2 = lon1 + Math.atan2(
						Math.sin(b) * Math.sin(d) * Math.cos(lat1),
						Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

		return new double[]{Math.toDegrees(lat2), (Math.toDegrees(lon2) + 540) % 360 - 180};
	}
}
