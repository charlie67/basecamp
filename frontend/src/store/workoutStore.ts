import { create } from 'zustand';
import { searchWorkouts, type MapBounds, type Workout } from '../api/workouts.ts';
import { endOfDayIso, startOfDayIso } from '../lib/format.ts';

export interface DateFilters {
  // Both yyyy-mm-dd, as produced by <input type="date">. Either side may be
  // omitted for an open-ended range.
  from: string | null;
  to: string | null;
}

// The map wants only what its viewport shows; the list wants everything matching
// the date. Both read from this one store, so each page declares which it is and
// the bounds are applied for the map alone.
export type WorkoutScope = 'map' | 'list';

interface WorkoutState {
  workouts: Workout[];
  totalElements: number;
  // True while the current filters have no results behind them yet, which is what
  // asks the map to fetch. Cleared once the search answers.
  needsLoad: boolean;
  loading: boolean;
  error: string | null;
  filters: DateFilters;
  bounds: MapBounds | null;
  scope: WorkoutScope;
  // Bumped on every filter change. A search in flight when it changes is discarded,
  // and the map's load effect watches it so it restarts on a new filter.
  generation: number;
  // Which track the map has selected. Lives here rather than in MapPage because
  // the map is remounted whenever the base layer changes projection.
  selectedWorkoutId: string | null;
  load: () => Promise<void>;
  setDateFilters: (filters: DateFilters) => void;
  setBounds: (bounds: MapBounds) => void;
  setScope: (scope: WorkoutScope) => void;
  selectWorkout: (id: string | null) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Zoomed out far enough, Leaflet reports a viewport running off the ends of the
// world, so it is held to real coordinates before going on the wire.
function clampBounds(bounds: MapBounds): MapBounds {
  return {
    min_lat: clamp(bounds.min_lat, -90, 90),
    max_lat: clamp(bounds.max_lat, -90, 90),
    min_lon: clamp(bounds.min_lon, -180, 180),
    max_lon: clamp(bounds.max_lon, -180, 180),
  };
}

function sameBounds(a: MapBounds | null, b: MapBounds): boolean {
  if (!a) return false;
  return (
    a.min_lat === b.min_lat &&
    a.max_lat === b.max_lat &&
    a.min_lon === b.min_lon &&
    a.max_lon === b.max_lon
  );
}

// Aborts whatever search is in flight; the store treats the resulting AbortError as
// an expected outcome rather than a failure worth showing.
let inFlight: AbortController | null = null;

export const useWorkoutStore = create<WorkoutState>((set, get) => {
  // Asks for the new query and invalidates any search still in flight, so a filter
  // change can never have its old results land after the new ones.
  //
  // What is already on screen is deliberately left alone: the new results replace it
  // when they land. Clearing here instead would blank every track for the duration
  // of the request, which reads as the map breaking every time it is panned or the
  // date is changed.
  const reset = () => {
    inFlight?.abort();
    inFlight = null;
    set((state) => ({
      needsLoad: true,
      loading: false,
      error: null,
      generation: state.generation + 1,
    }));
  };

  return {
    workouts: [],
    totalElements: 0,
    needsLoad: true,
    loading: false,
    error: null,
    filters: { from: null, to: null },
    bounds: null,
    scope: 'list',
    generation: 0,
    selectedWorkoutId: null,

    selectWorkout: (id) => set({ selectedWorkoutId: id }),

    setDateFilters: (filters) => {
      const current = get().filters;
      if (current.from === filters.from && current.to === filters.to) return;
      set({ filters });
      reset();
    },

    setBounds: (viewport) => {
      const visible = clampBounds(viewport);
      if (sameBounds(get().bounds, visible)) return;
      set({ bounds: visible });
      if (get().scope === 'map') reset();
    },

    setScope: (scope) => {
      if (get().scope === scope) return;
      set({ scope });
      reset();
    },

    load: async () => {
      const { loading, needsLoad, filters, bounds, scope, generation } = get();
      if (loading || !needsLoad) return;

      const controller = new AbortController();
      inFlight = controller;
      set({ loading: true, error: null });

      try {
        const workouts = await searchWorkouts(
          {
            from: startOfDayIso(filters.from),
            to: endOfDayIso(filters.to),
            bounds: scope === 'map' ? bounds : null,
          },
          controller.signal,
        );

        // A filter changed while this search was running; its results describe a
        // query nobody is asking for any more.
        if (get().generation !== generation) return;

        set({
          // The whole result arrives at once, so it swaps out whatever the previous
          // query left on screen. This is what lets the old tracks stay visible
          // while the new ones are on their way.
          workouts,
          totalElements: workouts.length,
          needsLoad: false,
          loading: false,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (get().generation !== generation) return;
        set({
          error: err instanceof Error ? err.message : 'Something went wrong',
          loading: false,
        });
      } finally {
        if (inFlight === controller) inFlight = null;
      }
    },
  };
});
