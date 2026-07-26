import { getAccessToken } from '../auth/token.ts';
import { appConfig } from '../config.ts';

export interface Workout {
  id: string;
  type: string | null;
  start_date: string | null;
  end_date: string | null;
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

export async function fetchWorkouts(
  page: number,
  size: number,
): Promise<PagedResponse<Workout>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}/workouts?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) {
    throw new Error('Your session expired — reload the page to sign in again.');
  }
  if (!response.ok) {
    throw new Error(`Failed to load workouts (${response.status})`);
  }

  return response.json();
}
