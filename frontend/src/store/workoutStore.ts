import { create } from 'zustand';
import { fetchWorkouts, type Workout } from '../api/workouts.ts';

const PAGE_SIZE = 20;

interface WorkoutState {
  workouts: Workout[];
  nextPage: number;
  totalElements: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  workouts: [],
  nextPage: 0,
  totalElements: 0,
  hasMore: true,
  loading: false,
  error: null,
  loadMore: async () => {
    const { loading, hasMore, nextPage } = get();
    if (loading || !hasMore) return;

    set({ loading: true, error: null });
    try {
      const result = await fetchWorkouts(nextPage, PAGE_SIZE);
      set((state) => ({
        workouts: [...state.workouts, ...(result.content ?? [])],
        nextPage: (result.page ?? nextPage) + 1,
        totalElements: result.total_elements ?? state.totalElements,
        hasMore: !(result.last ?? true),
        loading: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Something went wrong',
        loading: false,
      });
    }
  },
}));
