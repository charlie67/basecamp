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
import ElevationProfile from './ElevationProfile.tsx';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-100">{value}</dd>
    </div>
  );
}

function title(type: string | null): string {
  if (!type) return 'Workout';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Stats for the track selected on the map. Rendered as a sibling of the
 * MapContainer rather than a Leaflet layer, so the map never intercepts its
 * clicks and a projection switch does not tear it down.
 */
export default function WorkoutDetailPanel({
  workout,
  onClose,
}: {
  workout: Workout;
  onClose: () => void;
}) {
  const heartRate = workout.statistics?.heart_rate ?? null;

  return (
    <div className="absolute bottom-3 left-3 z-[1000] w-72 max-w-[calc(100%-1.5rem)] rounded-lg border border-slate-700 bg-slate-900/90 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-medium text-slate-100">{title(workout.type)}</h2>
          <p className="text-xs text-slate-400">
            {formatDate(workout.start_date)} · {formatTimeOfDay(workout.start_date)} →{' '}
            {formatTimeOfDay(workout.end_date)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-1 -mt-1 rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          ✕
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <Stat label="Distance" value={formatDistance(workout.distance_m)} />
        <Stat label="Duration" value={formatDuration(workout.duration_seconds)} />
        <Stat
          label="Avg pace"
          value={formatPace(workout.duration_seconds, workout.distance_m)}
        />
        <Stat label="Heart rate" value={formatHeartRate(heartRate)} />
        <Stat label="Ascent" value={formatElevation(workout.elevation_gain_m)} />
        <Stat label="Descent" value={formatElevation(workout.elevation_loss_m)} />
      </dl>

      <div className="mt-2">
        <Stat
          label="Calories"
          value={formatCalories(workout.active_calories, workout.basal_calories)}
        />
      </div>

      <div className="mt-3 border-t border-slate-800 pt-3 empty:hidden">
        <ElevationProfile
          points={workout.route_points ?? []}
          distanceM={workout.distance_m}
        />
      </div>
    </div>
  );
}
