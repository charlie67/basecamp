import { useWorkoutStore } from '../store/workoutStore.ts';
import { ALL_TIME, DATE_RANGE_PRESETS, matchPreset } from '../lib/dateRanges.ts';
import BottomSheet from './BottomSheet.tsx';
import { CheckIcon } from './icons.tsx';

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
  // 'custom' whenever the dates were typed rather than picked, which keeps the
  // menu from claiming a range the inputs no longer hold.
  const preset = matchPreset(filters);

  const selectRange = (id: string) => {
    if (id === ALL_TIME) {
      setDateFilters({ from: null, to: null });
      return;
    }
    const chosen = DATE_RANGE_PRESETS.find((p) => p.id === id);
    if (chosen) setDateFilters(chosen.range());
  };

  const container = floating
    ? 'absolute left-3 top-3 z-[1000] rounded-lg border border-slate-700 bg-slate-900/90 p-3 shadow-lg backdrop-blur'
    : 'mb-6 rounded-lg border border-slate-800 bg-slate-900 p-3';

  return (
    <div className={container}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-400">
          Range
          <select
            className={INPUT_CLASS}
            value={preset}
            onChange={(e) => selectRange(e.target.value)}
          >
            <option value={ALL_TIME}>All time</option>
            {DATE_RANGE_PRESETS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            {/* Only offered as somewhere for the menu to sit while the dates are
                hand-edited — picking it would have nothing to apply. */}
            {preset === 'custom' && (
              <option value="custom" disabled>
                Custom
              </option>
            )}
          </select>
        </label>
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
        <span className="text-sm text-slate-500">
          {totalElements} {totalElements === 1 ? 'workout' : 'workouts'}
        </span>
      </div>
    </div>
  );
}

// Sized for a finger rather than a pointer, and big enough that iOS does not
// zoom the page in when one is focused (it does below 16px).
const SHEET_INPUT_CLASS =
  'h-12 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-800 px-3 text-base text-slate-100 [color-scheme:dark] focus:border-slate-500 focus:outline-none';

/**
 * The same date filter as the bar above, for a phone: every preset as a row to
 * tap, with the two dates underneath for a range of your own. Picking a preset
 * applies it and closes the sheet; the dates apply as they are typed.
 */
export function DateRangeSheet({ onClose }: { onClose: () => void }) {
  const { filters, setDateFilters } = useWorkoutStore();
  const preset = matchPreset(filters);

  const options = [{ id: ALL_TIME, label: 'All time' }, ...DATE_RANGE_PRESETS];

  const choose = (id: string) => {
    if (id === ALL_TIME) {
      setDateFilters({ from: null, to: null });
    } else {
      const chosen = DATE_RANGE_PRESETS.find((p) => p.id === id);
      if (chosen) setDateFilters(chosen.range());
    }
    onClose();
  };

  return (
    <BottomSheet title="Date range" onClose={onClose}>
      <div className="mt-2 flex flex-col gap-1">
        {options.map((option) => {
          const current = option.id === preset;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={current}
              onClick={() => choose(option.id)}
              className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-left text-base ${
                current ? 'bg-slate-800 font-medium text-slate-100' : 'text-slate-200 active:bg-slate-800'
              }`}
            >
              {option.label}
              {current && <CheckIcon className="h-5 w-5 text-sky-400" />}
            </button>
          );
        })}
      </div>

      <fieldset className="mt-4 border-t border-slate-800 pt-4">
        <legend className="sr-only">Custom range</legend>
        <p className="mb-2 text-sm font-medium text-slate-300">
          Custom{preset === 'custom' && <span className="ml-2 text-sky-400">· in use</span>}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-400">
            From
            <input
              type="date"
              className={SHEET_INPUT_CLASS}
              value={filters.from ?? ''}
              max={filters.to ?? undefined}
              onChange={(e) => setDateFilters({ ...filters, from: e.target.value || null })}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-400">
            To
            <input
              type="date"
              className={SHEET_INPUT_CLASS}
              value={filters.to ?? ''}
              min={filters.from ?? undefined}
              onChange={(e) => setDateFilters({ ...filters, to: e.target.value || null })}
            />
          </label>
        </div>
      </fieldset>
    </BottomSheet>
  );
}
