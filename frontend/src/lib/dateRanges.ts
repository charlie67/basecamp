import type { DateFilters } from '../store/workoutStore.ts';

// Ready-made ranges for the date filter. Every one is expressed in the same
// yyyy-mm-dd the date inputs use, so choosing a preset and then nudging one end
// by hand are the same edit as far as the store is concerned.

/**
 * yyyy-mm-dd for the viewer's own calendar. `toISOString()` would be a day out
 * for anyone west of UTC after their evening, so the parts are read off the
 * local date instead.
 */
function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function today(): Date {
  return new Date();
}

function daysAgo(count: number): Date {
  const date = today();
  date.setDate(date.getDate() - count);
  return date;
}

/**
 * The same day-of-month `count` months back, or that month's last day when it is
 * too short. Plain `setMonth` would roll 31 March back to 3 March.
 */
function monthsAgo(count: number): Date {
  const from = today();
  const day = from.getDate();
  from.setDate(1);
  from.setMonth(from.getMonth() - count);
  const lastOfMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  from.setDate(Math.min(day, lastOfMonth));
  return from;
}

export interface DateRangePreset {
  id: string;
  label: string;
  // Evaluated on use rather than at module load, so a tab left open overnight
  // does not hand out yesterday's idea of "this month".
  range: () => DateFilters;
}

// "Last N months" are rolling windows ending today; the named periods are whole
// calendar months and years. Both readings of "last month" are in common use, so
// the two styles are labelled differently to keep them apart.
export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  {
    id: 'last-7-days',
    label: 'Last 7 days',
    range: () => ({ from: localDay(daysAgo(6)), to: localDay(today()) }),
  },
  {
    id: 'last-30-days',
    label: 'Last 30 days',
    range: () => ({ from: localDay(daysAgo(29)), to: localDay(today()) }),
  },
  {
    id: 'this-month',
    label: 'This month',
    range: () => {
      const start = today();
      start.setDate(1);
      return { from: localDay(start), to: localDay(today()) };
    },
  },
  {
    id: 'last-month',
    label: 'Last month',
    range: () => {
      const now = today();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Day 0 of a month is the last day of the one before it.
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: localDay(start), to: localDay(end) };
    },
  },
  {
    id: 'last-3-months',
    label: 'Last 3 months',
    range: () => ({ from: localDay(monthsAgo(3)), to: localDay(today()) }),
  },
  {
    id: 'last-6-months',
    label: 'Last 6 months',
    range: () => ({ from: localDay(monthsAgo(6)), to: localDay(today()) }),
  },
  {
    id: 'last-12-months',
    label: 'Last 12 months',
    range: () => ({ from: localDay(monthsAgo(12)), to: localDay(today()) }),
  },
  {
    id: 'this-year',
    label: 'This year',
    range: () => {
      const now = today();
      return { from: localDay(new Date(now.getFullYear(), 0, 1)), to: localDay(now) };
    },
  },
  {
    id: 'last-year',
    label: 'Last year',
    range: () => {
      const year = today().getFullYear() - 1;
      return { from: localDay(new Date(year, 0, 1)), to: localDay(new Date(year, 11, 31)) };
    },
  },
];

/** The id for an open-ended range — no preset, and nothing to clear. */
export const ALL_TIME = 'all';

/** What the current filters were most likely picked from, for the range menu. */
export function matchPreset(filters: DateFilters): string {
  if (filters.from === null && filters.to === null) return ALL_TIME;
  const match = DATE_RANGE_PRESETS.find((preset) => {
    const range = preset.range();
    return range.from === filters.from && range.to === filters.to;
  });
  return match?.id ?? 'custom';
}
