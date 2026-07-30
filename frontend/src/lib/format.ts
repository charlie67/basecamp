// Display formatters for workout stats. Every one of these takes a value that
// may be absent — HealthKit does not record distance for every workout type,
// and older imports predate some fields — so they all fall back to an em dash.

const EMPTY = '—';

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatDistance(metres: number | null | undefined): string {
  if (!isNumber(metres)) return EMPTY;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!isNumber(seconds) || seconds <= 0) return EMPTY;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${total % 60}s`;
}

/** Average pace as mm:ss per kilometre — the usual unit for walking a hill. */
export function formatPace(
  seconds: number | null | undefined,
  metres: number | null | undefined,
): string {
  if (!isNumber(seconds) || !isNumber(metres) || seconds <= 0 || metres <= 0) {
    return EMPTY;
  }
  const secondsPerKm = seconds / (metres / 1000);
  const minutes = Math.floor(secondsPerKm / 60);
  const remainder = Math.round(secondsPerKm % 60);
  // Rounding 59.6s up would otherwise render as 11:60.
  const [m, s] = remainder === 60 ? [minutes + 1, 0] : [minutes, remainder];
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function formatElevation(metres: number | null | undefined): string {
  if (!isNumber(metres)) return EMPTY;
  return `${Math.round(metres)} m`;
}

/**
 * Active calories, with the active+basal total alongside when it is known —
 * the active figure is the one people mean by "calories burned on the walk".
 */
export function formatCalories(
  active: number | null | undefined,
  basal: number | null | undefined,
): string {
  if (!isNumber(active)) return isNumber(basal) ? `${Math.round(basal)} kcal` : EMPTY;
  if (!isNumber(basal)) return `${Math.round(active)} kcal`;
  return `${Math.round(active)} kcal (${Math.round(active + basal)} total)`;
}

export function formatHeartRate(
  statistic: { avg: number; max: number } | null | undefined,
): string {
  if (!statistic) return EMPTY;
  return `${Math.round(statistic.avg)} avg · ${Math.round(statistic.max)} max`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimeOfDay(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// A `<input type="date">` gives a bare yyyy-mm-dd with no zone, but a workout is
// stored at an absolute instant. The two conversions below pin those days to the
// viewer's local midnight, so "1 March" means the day the viewer actually lived
// through rather than a UTC day that starts mid-evening for some of them.

/** Start of the given local day, as an ISO instant. */
export function startOfDayIso(day: string | null): string | null {
  if (!day) return null;
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Start of the day *after* the given one — the range's exclusive upper bound. */
export function endOfDayIso(day: string | null): string | null {
  if (!day) return null;
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}
