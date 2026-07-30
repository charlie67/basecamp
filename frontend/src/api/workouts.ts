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

export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
  last: boolean;
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
  page: number;
}

async function getWorkoutPage(
  path: string,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<PagedResponse<Workout>> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}?${params}`, {
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
 * Filtered listing. Omitted filters are left off the query string entirely, which
 * the backend reads as "no such predicate". Page size is fixed server-side.
 */
export async function searchWorkouts(
  query: WorkoutQuery,
  signal?: AbortSignal,
): Promise<PagedResponse<Workout>> {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.bounds) {
    for (const [key, value] of Object.entries(query.bounds)) {
      params.set(key, String(value));
    }
  }

  return getWorkoutPage('/workouts/search', params, signal);
}
