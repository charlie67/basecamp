import { useWorkoutStore } from '../store/workoutStore.ts';

// Native date inputs render their picker chrome for a light page unless the
// element opts into the dark scheme, which leaves the calendar icon almost
// invisible against the app's slate background.
const INPUT_CLASS =
  'rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 [color-scheme:dark] focus:border-slate-500 focus:outline-none';

interface Props {
  // The map floats this over the tiles; the list keeps it in the normal flow.
  floating?: boolean;
}

/**
 * Date-range filter shared by the map and the workouts list. Both pages read the
 * same store, so a range chosen on one is already applied when the other opens.
 */
export default function WorkoutFilterBar({ floating = false }: Props) {
  const { filters, setDateFilters, totalElements } = useWorkoutStore();
  const active = filters.from !== null || filters.to !== null;

  const container = floating
    ? 'absolute left-3 top-3 z-[1000] rounded-lg border border-slate-700 bg-slate-900/90 p-3 shadow-lg backdrop-blur'
    : 'mb-6 rounded-lg border border-slate-800 bg-slate-900 p-3';

  return (
    <div className={container}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-400">
          From
          <input
            type="date"
            className={INPUT_CLASS}
            value={filters.from ?? ''}
            max={filters.to ?? undefined}
            onChange={(e) => setDateFilters({ ...filters, from: e.target.value || null })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-400">
          To
          <input
            type="date"
            className={INPUT_CLASS}
            value={filters.to ?? ''}
            min={filters.from ?? undefined}
            onChange={(e) => setDateFilters({ ...filters, to: e.target.value || null })}
          />
        </label>
        {active && (
          <button
            type="button"
            onClick={() => setDateFilters({ from: null, to: null })}
            className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            Clear
          </button>
        )}
        {active && (
          <span className="text-sm text-slate-500">{totalElements} matching</span>
        )}
      </div>
    </div>
  );
}
