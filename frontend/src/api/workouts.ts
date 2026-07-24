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
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export async function fetchWorkouts(
  page: number,
  size: number,
): Promise<PagedResponse<Workout>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  const response = await fetch(`${API_BASE}/workouts?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to load workouts (${response.status})`);
  }

  return response.json();
}
