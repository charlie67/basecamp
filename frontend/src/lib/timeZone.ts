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

// A yyyy-mm-dd from the date picker names a calendar day wherever each hike was,
// not one absolute span of time: "1 March" in Yosemite starts eight hours after
// "1 March" in London. Clocks run from UTC−12 to UTC+14, so every such day lies
// inside the UTC day widened by those offsets. The search asks for that wider
// window, and `onLocalDay` then keeps each workout only if its own local date is
// one that was picked.
const MAX_AHEAD_OF_UTC_MS = 14 * 3600 * 1000;
const MAX_BEHIND_UTC_MS = 12 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

function utcMidnight(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Earliest instant that is `day` anywhere on Earth, as an ISO instant. */
export function earliestStartOfDayIso(day: string | null): string | null {
  if (!day) return null;
  const midnight = utcMidnight(day);
  return Number.isNaN(midnight) ? null : new Date(midnight - MAX_AHEAD_OF_UTC_MS).toISOString();
}

/** Latest instant that is still `day` somewhere — the window's exclusive upper bound. */
export function latestEndOfDayIso(day: string | null): string | null {
  if (!day) return null;
  const midnight = utcMidnight(day);
  return Number.isNaN(midnight)
    ? null
    : new Date(midnight + DAY_MS + MAX_BEHIND_UTC_MS).toISOString();
}

/** yyyy-mm-dd of an instant as the clocks read in `timeZone` (the viewer's when undefined). */
function localDay(value: string, timeZone: string | undefined): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone }).formatToParts(date);
  } catch {
    // A zone this browser's tz data doesn't know; read it as the viewer's.
    parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  }
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Whether the workout started on a day in [from, to] (inclusive, either open) where it happened. */
export function onLocalDay(workout: Workout, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!workout.start_date) return false;
  const day = localDay(workout.start_date, workoutTimeZone(workout));
  if (!day) return false;
  // yyyy-mm-dd sorts the same as the dates it names.
  return (!from || day >= from) && (!to || day <= to);
}
