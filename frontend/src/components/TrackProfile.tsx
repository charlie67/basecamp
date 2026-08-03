import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { MetricSample, RoutePoint } from '../api/workouts.ts';

const WIDTH = 272;
const ELEVATION_HEIGHT = 96;
const SERIES_HEIGHT = 56;
const PADDING_Y = 6;

const ELEVATION_COLOR = '#38bdf8';
const HEART_RATE_COLOR = '#f87171';
const GUIDE_COLOR = '#94a3b8';
// The panel's own background, so the scrub dot reads as sitting on the line
// rather than in it.
const DOT_STROKE = '#0f172a';

const EARTH_RADIUS_M = 6371000;

function haversine(a: RoutePoint, b: RoutePoint): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** The distance axis both charts are drawn against, shared so they line up. */
interface Geometry {
  cumulative: number[];
  totalDistance: number;
  xs: number[];
}

function buildGeometry(points: RoutePoint[]): Geometry | null {
  if (points.length < 2) return null;

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(points[i - 1], points[i]));
  }
  const totalDistance = cumulative[cumulative.length - 1];
  if (totalDistance <= 0) return null;

  return {
    cumulative,
    totalDistance,
    xs: cumulative.map((d) => (d / totalDistance) * WIDTH),
  };
}

/** One value per route point, `null` wherever the metric has nothing to say. */
type Aligned = (number | null)[];

interface Plot {
  values: Aligned;
  ys: (number | null)[];
  line: string;
  min: number;
  max: number;
}

/**
 * Positions a series against the shared x-axis.
 *
 * The path breaks wherever a value is missing: a heart rate monitor that dropped
 * out for ten minutes should leave a gap, not a straight line implying it held
 * steady across the whole climb.
 */
function buildPlot(values: Aligned, xs: number[], height: number): Plot | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return null;

  const min = Math.min(...present);
  const max = Math.max(...present);
  // A flat line has no shape worth plotting — and no range to scale against.
  if (!(max > min)) return null;

  const plotHeight = height - PADDING_Y * 2;
  const ys = values.map((v) =>
    v === null ? null : PADDING_Y + plotHeight - ((v - min) / (max - min)) * plotHeight,
  );

  let line = '';
  let penDown = false;
  ys.forEach((y, i) => {
    if (y === null) {
      penDown = false;
      return;
    }
    line += `${penDown ? 'L' : 'M'}${xs[i].toFixed(1)} ${y.toFixed(1)}`;
    penDown = true;
  });

  return { values, ys, line, min, max };
}

// How far outside a sample's own interval a route point may sit and still be given
// its value. This is what carries an instantaneous reading — one where the watch
// reports a beat rate for a single moment, so the interval has no width — across to
// the fixes either side of it. Past a minute the monitor has genuinely dropped out
// and the gap in the chart is the truth.
const MAX_SAMPLE_GAP_MS = 60_000;

/**
 * Resamples a time series onto the route points, so one scrub index reads every
 * chart and the map marker at once.
 *
 * A sample covers an interval rather than an instant, and the width of it varies by
 * where the data came from: a live watch reports each beat rate on its own, while
 * older exports sent one value averaged over each track chunk — a quarter of an hour
 * at a time. Every fix inside a sample's interval therefore takes its value, which
 * is what makes those coarse workouts read as a continuous, if blocky, trace instead
 * of two dozen isolated dots with the rest of the walk blank.
 *
 * Both sides are already in time order, so this walks them together rather than
 * searching per point.
 */
function alignToRoute(points: RoutePoint[], samples: MetricSample[]): Aligned {
  const values: Aligned = new Array(points.length).fill(null);
  if (samples.length === 0) return values;

  const starts = samples.map((sample) => Date.parse(sample.t));
  // Older rows predate the column being written, and an interval that will not parse
  // is treated as the instant it starts at.
  const ends = samples.map((sample, i) => {
    const end = sample.e === null ? NaN : Date.parse(sample.e);
    return Number.isNaN(end) || end < starts[i] ? starts[i] : end;
  });

  // Zero while the fix falls inside the sample, and how far outside it otherwise.
  const distance = (i: number, at: number) =>
    at < starts[i] ? starts[i] - at : Math.max(0, at - ends[i]);

  let cursor = 0;
  for (let i = 0; i < points.length; i++) {
    const at = points[i].t === null ? NaN : Date.parse(points[i].t as string);
    // Older imports carry fixes with no timestamp, which nothing can be aligned to.
    if (Number.isNaN(at)) continue;

    // Both lists run forwards, so the cursor only ever has to move on past samples
    // that finished before this fix.
    while (cursor + 1 < samples.length && ends[cursor] < at) cursor++;

    // The sample before the cursor can still be the nearer one when the fix has
    // fallen into the space between two of them.
    const best =
      cursor > 0 && distance(cursor - 1, at) < distance(cursor, at) ? cursor - 1 : cursor;
    if (distance(best, at) <= MAX_SAMPLE_GAP_MS) {
      values[i] = samples[best].v;
    }
  }
  return values;
}

/** The sample closest to `target` metres along the track. */
function nearestIndex(cumulative: number[], target: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] < target) low = mid + 1;
    else high = mid;
  }
  // `low` is the first sample at or past the target; the one before it may be nearer.
  if (low > 0 && target - cumulative[low - 1] < cumulative[low] - target) return low - 1;
  return low;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function Header({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      {value}
    </div>
  );
}

/** One series' SVG, with the scrub guide and dot when the pointer is on it. */
function Chart({
  plot,
  xs,
  height,
  color,
  fill,
  index,
}: {
  plot: Plot;
  xs: number[];
  height: number;
  color: string;
  fill: boolean;
  index: number | null;
}) {
  const y = index === null ? null : plot.ys[index];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" aria-hidden="true">
      {fill && (
        <path
          d={`${plot.line} L${WIDTH} ${height} L0 ${height} Z`}
          fill={color}
          fillOpacity="0.15"
        />
      )}
      <path
        d={plot.line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {index !== null && (
        <g pointerEvents="none">
          <line
            x1={xs[index]}
            y1={0}
            x2={xs[index]}
            y2={height}
            stroke={GUIDE_COLOR}
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          {/* No dot where the series has a gap — the guide alone says "nothing here". */}
          {y !== null && (
            <circle cx={xs[index]} cy={y} r="3.5" fill={color} stroke={DOT_STROKE} strokeWidth="1.5" />
          )}
        </g>
      )}
    </svg>
  );
}

/**
 * Elevation and heart rate against distance for one track, as self-contained SVGs
 * sharing an x-axis and a single scrub position.
 *
 * The points come from the list endpoint, which downsamples 1-in-20 — plenty of
 * shape for a sparkline, but the accumulated length undershoots the real distance
 * because it cuts the corners. So the x-axis label uses the workout's own reported
 * distance when there is one, and the scrubbed readout is scaled to match it
 * rather than quoting a distance the axis disagrees with.
 *
 * Scrubbing reports the route point under the pointer through `onScrub`, which is
 * how the map gets somewhere to put its marker. Heart rate is resampled onto those
 * same points so that one index means one moment on the walk everywhere.
 */
export default function TrackProfile({
  points,
  distanceM,
  heartRate,
  expectHeartRate,
  onScrub,
}: {
  points: RoutePoint[];
  distanceM: number | null;
  // Null until the samples land — or forever, for a workout that recorded none.
  heartRate: MetricSample[] | null;
  // Whether the workout claims a heart rate at all, from its summary statistics.
  // Lets the panel hold the space while the samples are in flight instead of
  // shifting everything below when they arrive.
  expectHeartRate: boolean;
  onScrub?: (index: number | null) => void;
}) {
  const geometry = useMemo(() => buildGeometry(points), [points]);
  const elevation = useMemo(
    () =>
      geometry
        ? buildPlot(points.map((p) => p.altitude_m), geometry.xs, ELEVATION_HEIGHT)
        : null,
    [points, geometry],
  );
  const heartRatePlot = useMemo(
    () =>
      geometry && heartRate
        ? buildPlot(alignToRoute(points, heartRate), geometry.xs, SERIES_HEIGHT)
        : null,
    [points, geometry, heartRate],
  );

  const [index, setIndex] = useState<number | null>(null);

  // Selecting another track reuses this component, and an index into the old
  // track means nothing in the new one.
  useEffect(() => setIndex(null), [points]);

  // Told on every change, including the null that closing the panel produces —
  // otherwise the map would keep a marker for a profile nobody is touching.
  useEffect(() => {
    onScrub?.(index);
  }, [index, onScrub]);
  useEffect(() => () => onScrub?.(null), [onScrub]);

  if (!geometry || (!elevation && !heartRatePlot && !expectHeartRate)) return null;

  const { cumulative, totalDistance, xs } = geometry;
  const axisDistance = distanceM ?? totalDistance;
  // What the axis calls the full length, applied to the point under the pointer.
  const distanceAt = (i: number) => (cumulative[i] / totalDistance) * axisDistance;

  const scrubTo = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setIndex(nearestIndex(cumulative, fraction * totalDistance));
  };

  const step = (delta: number) =>
    setIndex((current) => clamp((current ?? 0) + delta, 0, points.length - 1));

  const heartRateAt = (i: number) => heartRatePlot?.values[i] ?? null;
  const spoken = (i: number) => {
    const bpm = heartRateAt(i);
    return [
      `${(distanceAt(i) / 1000).toFixed(2)} km`,
      elevation ? `${Math.round(points[i].altitude_m)} metres` : null,
      bpm === null ? null : `${Math.round(bpm)} beats per minute`,
    ]
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div
      // One control for both charts: the guide line, the readouts and the map
      // marker all follow the same index, so there is only ever one position to
      // move. touch-none keeps a finger dragged along them from scrolling the
      // page instead of scrubbing.
      className="cursor-crosshair touch-none rounded outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
      role="slider"
      tabIndex={0}
      aria-label="Route profile — scrub to read the track at a point along it"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={points.length - 1}
      aria-valuenow={index ?? 0}
      aria-valuetext={index === null ? 'Not scrubbing' : spoken(index)}
      onPointerDown={scrubTo}
      onPointerMove={scrubTo}
      // Touch pointers are captured implicitly on pointerdown, so the finger keeps
      // scrubbing past the edges — but nothing hovers afterwards the way a mouse
      // does, so the readout would otherwise stick.
      onPointerUp={(event) => {
        if (event.pointerType !== 'mouse') setIndex(null);
      }}
      onPointerLeave={() => setIndex(null)}
      onPointerCancel={() => setIndex(null)}
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        if (delta !== 0) {
          event.preventDefault();
          step(delta);
        } else if (event.key === 'Home') {
          event.preventDefault();
          setIndex(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          setIndex(points.length - 1);
        } else if (event.key === 'Escape') {
          setIndex(null);
        }
      }}
      onBlur={() => setIndex(null)}
    >
      {elevation && (
        <>
          <Header
            label="Elevation"
            value={
              index === null ? (
                <span className="text-slate-500">
                  {Math.round(elevation.min)}–{Math.round(elevation.max)} m
                </span>
              ) : (
                <span className="tabular-nums text-sky-300">
                  {Math.round(points[index].altitude_m)} m
                  <span className="text-slate-500">
                    {' '}
                    · {(distanceAt(index) / 1000).toFixed(2)} km
                  </span>
                </span>
              )
            }
          />
          <Chart
            plot={elevation}
            xs={xs}
            height={ELEVATION_HEIGHT}
            color={ELEVATION_COLOR}
            fill
            index={index}
          />
        </>
      )}

      {(heartRatePlot || expectHeartRate) && (
        <div className={elevation ? 'mt-2' : ''}>
          <Header
            label="Heart rate"
            value={
              !heartRatePlot ? (
                // Reserved while the samples are in flight, and the resting state
                // for a track whose monitor recorded too little to draw.
                <span className="text-slate-600">—</span>
              ) : index === null ? (
                <span className="text-slate-500">
                  {Math.round(heartRatePlot.min)}–{Math.round(heartRatePlot.max)} bpm
                </span>
              ) : (
                <span className="tabular-nums text-red-300">
                  {heartRateAt(index) === null
                    ? '—'
                    : `${Math.round(heartRateAt(index) as number)} bpm`}
                </span>
              )
            }
          />
          {heartRatePlot ? (
            <Chart
              plot={heartRatePlot}
              xs={xs}
              height={SERIES_HEIGHT}
              color={HEART_RATE_COLOR}
              fill={false}
              index={index}
            />
          ) : (
            <div style={{ aspectRatio: `${WIDTH} / ${SERIES_HEIGHT}` }} />
          )}
        </div>
      )}

      <div className="flex justify-between text-xs text-slate-500">
        <span>0 km</span>
        <span>{(axisDistance / 1000).toFixed(1)} km</span>
      </div>
    </div>
  );
}
