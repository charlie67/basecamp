import tzLookup from '@photostructure/tz-lookup';
import type { Workout } from '../api/workouts.ts';

/**
 * The IANA zone a workout happened in, so its times read as the clocks there did.
 *
 * Where the route starts is the ground truth, looked up offline from the first
 * fix. A workout with no route (indoors, or an older import) falls back to the
 * zone HealthKit recorded with it. Undefined means neither is known, and the
 * formatters then use the viewer's own zone.
 */
export function workoutTimeZone(workout: Workout): string | undefined {
  const start = workout.route_points?.[0];
  if (start) {
    try {
      return tzLookup(start.lat, start.lon);
    } catch {
      // Out-of-range coordinates; fall through to what HealthKit recorded.
    }
  }
  return workout.time_zone ?? undefined;
}
