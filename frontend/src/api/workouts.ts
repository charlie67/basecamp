import { getAccessToken } from '../auth/token.ts';
import { appConfig } from '../config.ts';

export interface RoutePoint {
  t: string | null;
  lat: number;
  lon: number;
  altitude_m: number;
  ellipsoidal_altitude_m: number;
  horizontal_accuracy_m: number;
  vertical_accuracy_m: number;
  speed_mps: number;
  speed_accuracy_mps: number;
  course_deg: number;
  course_accuracy_deg: number;
}

// One sample of a workout's time series. Short field names because a long walk
// sends a few hundred of these: `t` and `e` bound the interval the value covers,
// and `v` is the value in the metric's own unit (bpm for heart_rate).
//
// `e` equals `t` for the instantaneous readings a watch sends live, and is wider
// on older exports that sent one value averaged over each track chunk.
export interface MetricSample {
  t: string;
  e: string | null;
  v: number;
}

// Per-metric aggregate from HealthKit, keyed by metric name (heart_rate,
// active_energy_burned, ...). Which metrics are present varies by workout.
export interface StatisticSummary {
  min: number;
  max: number;
  avg: number;
  sum: number;
  unit: string | null;
}

export interface Workout {
  id: string;
  type: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_seconds: number;
  distance_m: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  active_calories: number | null;
  basal_calories: number | null;
  route_point_count: number;
  statistics: Record<string, StatisticSummary> | null;
  route_points: RoutePoint[];
}

// Requests go through the Vite dev-server proxy (see vite.config.ts), which
// forwards /api/* to the backend same-origin — so no CORS is involved.
const API_BASE = appConfig.apiBase;

// The area of the world the map is currently showing, in WGS84 degrees. Leaflet
// reports bounds as lat/lng whichever CRS the map is drawn in, so the British
// National Grid layers need no conversion before these go to the API.
export interface MapBounds {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

// from/to are ISO-8601 instants: the frontend resolves the chosen calendar days
// to absolute times in the viewer's zone so the backend never has to guess one.
export interface WorkoutQuery {
  from?: string | null;
  to?: string | null;
  bounds?: MapBounds | null;
}

/**
 * Filtered listing. Omitted filters are left off the query string entirely, which
 * the backend reads as "no such predicate". The endpoint answers with every match
 * in one response — the filters are what keeps the result small, not paging.
 */
export async function searchWorkouts(
  query: WorkoutQuery,
  signal?: AbortSignal,
): Promise<Workout[]> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.bounds) {
    for (const [key, value] of Object.entries(query.bounds)) {
      params.set(key, String(value));
    }
  }

  const token = getAccessToken();
  const response = await fetch(`${API_BASE}/workouts/search?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (response.status === 401) {
    throw new Error('Your session expired — reload the page to sign in again.');
  }
  if (!response.ok) {
    throw new Error(`Failed to load workouts (${response.status})`);
  }

  return response.json();
}

/**
 * One metric's samples for a single workout, already thinned by the backend to a
 * chart's worth of points.
 *
 * Deliberately its own request rather than part of the search: that answers with
 * every track in the viewport, while a series is only ever wanted for the one
 * workout whose panel is open. A workout that recorded nothing for the metric
 * answers with an empty list.
 */
export async function fetchSeries(
  workoutId: string,
  metric: string,
  signal?: AbortSignal,
): Promise<MetricSample[]> {
  const token = getAccessToken();
  const response = await fetch(
    `${API_BASE}/workouts/${encodeURIComponent(workoutId)}/series/${encodeURIComponent(metric)}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to load ${metric} (${response.status})`);
  }

  return response.json();
}
