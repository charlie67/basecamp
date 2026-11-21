import type { Workout } from '../api/workouts.ts';
import {
  formatCalories,
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatTimeOfDay,
} from '../lib/format.ts';
import { workoutTimeZone } from '../lib/timeZone.ts';
import { trackColor } from '../lib/trackColor.ts';
import { useWorkoutStore } from '../store/workoutStore.ts';
import { useHeartRate, workoutTitle } from './WorkoutDetailPanel.tsx';
import TrackProfile from './TrackProfile.tsx';
import { ChevronLeftIcon } from './icons.tsx';

// The page's header height, and the strip of map left showing under it. The
// map page fits the track into that strip, so the two have to agree.
export const WORKOUT_PAGE_MAP_TOP = 64;
export const WORKOUT_PAGE_MAP_HEIGHT = 220;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums text-slate-100">{value}</dd>
    </div>
  );
}

/**
 * A workout's stats on a phone, where the desktop's floating panel would cover
 * the map and still be too small to read. It takes the screen, apart from a strip
 * of live map under the header with the track fitted into it, so scrubbing the
 * charts still moves the marker along the route. Back returns to the map.
 */
export default function WorkoutPage({ workout, onBack }: { workout: Workout; onBack: () => void }) {
  const heartRate = workout.statistics?.heart_rate ?? null;
  const timeZone = workoutTimeZone(workout);
  const heartRateSeries = useHeartRate(workout.id, heartRate !== null);
  const scrubPoint = useWorkoutStore((state) => state.scrubPoint);

  return (
    // Pointer events pass through to the map in the strip, so it can be panned
    // and pinched there, and come back on for the header and the stats.
    <div className="pointer-events-none absolute inset-0 z-[1100] flex flex-col">
      <header
        className="pointer-events-auto flex flex-none items-center gap-1 border-b border-slate-800 bg-slate-950 pl-1 pr-4"
        style={{ height: WORKOUT_PAGE_MAP_TOP }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to map"
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full text-slate-100 active:bg-slate-800"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-slate-100">{workoutTitle(workout.type)}</h1>
          <p className="truncate text-sm text-slate-400">
            {formatDate(workout.start_date, timeZone)} · {formatTimeOfDay(workout.start_date, timeZone)} →{' '}
            {formatTimeOfDay(workout.end_date, timeZone)}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="h-3 w-3 flex-none rounded-full"
          style={{ background: trackColor(workout.id) }}
        />
      </header>

      <div className="flex-none" style={{ height: WORKOUT_PAGE_MAP_HEIGHT }} />

      <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto border-t border-slate-800 bg-slate-950 px-4 pb-6 pt-4">
        <dl className="grid grid-cols-3 gap-x-3 gap-y-4">
          <Stat label="Distance" value={formatDistance(workout.distance_m)} />
          <Stat label="Time" value={formatDuration(workout.duration_seconds)} />
          <Stat label="Avg pace" value={formatPace(workout.duration_seconds, workout.distance_m)} />
          <Stat label="Ascent" value={formatElevation(workout.elevation_gain_m)} />
          <Stat label="Descent" value={formatElevation(workout.elevation_loss_m)} />
          {/* The average alone: the column is too narrow for "avg · max". */}
          <Stat label="Avg heart rate" value={heartRate ? `${Math.round(heartRate.avg)} bpm` : formatHeartRate(null)} />
        </dl>
        <p className="mt-4 text-sm text-slate-400">
          {heartRate && (
            <>
              Max heart rate <span className="text-slate-100">{Math.round(heartRate.max)} bpm</span>
              {' · '}
            </>
          )}
          Calories{' '}
          <span className="text-slate-100">
            {formatCalories(workout.active_calories, workout.basal_calories)}
          </span>
        </p>

        <section aria-label="Route profile" className="mt-4 border-t border-slate-800 pt-4 empty:hidden">
          <TrackProfile
            points={workout.route_points ?? []}
            distanceM={workout.distance_m}
            heartRate={heartRateSeries}
            expectHeartRate={heartRate !== null}
            onScrub={scrubPoint}
          />
        </section>
      </div>
    </div>
  );
}
