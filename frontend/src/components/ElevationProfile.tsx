import type { RoutePoint } from '../api/workouts.ts';

const WIDTH = 272;
const HEIGHT = 96;
const PADDING_Y = 6;

const EARTH_RADIUS_M = 6371000;

function haversine(a: RoutePoint, b: RoutePoint): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Elevation against distance for one track, as a self-contained SVG.
 *
 * The points come from the list endpoint, which downsamples 1-in-20 — plenty of
 * shape for a sparkline, but the accumulated length undershoots the real
 * distance because it cuts the corners. So the x-axis label uses the workout's
 * own reported distance when there is one.
 */
export default function ElevationProfile({
  points,
  distanceM,
}: {
  points: RoutePoint[];
  distanceM: number | null;
}) {
  if (points.length < 2) return null;

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(points[i - 1], points[i]));
  }
  const totalDistance = cumulative[cumulative.length - 1];
  if (totalDistance <= 0) return null;

  const altitudes = points.map((p) => p.altitude_m);
  const minAltitude = Math.min(...altitudes);
  const maxAltitude = Math.max(...altitudes);
  // Flat line means no usable altitude — indoor workouts and older imports.
  if (!(maxAltitude > minAltitude)) return null;

  const plotHeight = HEIGHT - PADDING_Y * 2;
  const x = (i: number) => (cumulative[i] / totalDistance) * WIDTH;
  const y = (altitude: number) =>
    PADDING_Y +
    plotHeight -
    ((altitude - minAltitude) / (maxAltitude - minAltitude)) * plotHeight;

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.altitude_m).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`;

  const axisDistance = distanceM ?? totalDistance;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-slate-500">
        <span>Elevation</span>
        <span>
          {Math.round(minAltitude)}–{Math.round(maxAltitude)} m
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Elevation profile, ${Math.round(minAltitude)} to ${Math.round(maxAltitude)} metres`}
      >
        <path d={area} fill="#38bdf8" fillOpacity="0.15" />
        <path
          d={line}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between text-xs text-slate-500">
        <span>0 km</span>
        <span>{(axisDistance / 1000).toFixed(1)} km</span>
      </div>
    </div>
  );
}
