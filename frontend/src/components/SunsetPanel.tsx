import { Fragment, useState } from 'react';
import type { SunEvent, SunsetDay, SunsetFactor, SunsetForecast, SunsetLabel } from '../api/sunset.ts';

export type SunsetStatus =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'done'; forecast: SunsetForecast };

const EMPTY = '—';

const LABEL_COLOR: Record<SunsetLabel, string> = {
  Excellent: 'bg-fuchsia-500 text-white',
  Good: 'bg-orange-500 text-white',
  Fair: 'bg-amber-500 text-slate-950',
  Poor: 'bg-slate-600 text-slate-100',
  Dull: 'bg-slate-700 text-slate-300',
};

// Open-Meteo's model names are long and the columns are narrow. A model the
// backend is configured with but that is not listed here shows under its own name.
const MODEL_NAMES: Record<string, { short: string; full: string }> = {
  ukmo_seamless: { short: 'UKMO', full: 'UK Met Office' },
  icon_seamless: { short: 'ICON', full: 'DWD ICON (Germany)' },
  gfs_seamless: { short: 'GFS', full: 'NOAA GFS (US)' },
  ecmwf_ifs025: { short: 'ECMWF', full: 'ECMWF IFS' },
  meteofrance_seamless: { short: 'MF', full: 'Météo-France' },
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// How far apart two models have to score a factor before it is called out as
// one they disagree on. The factors run 0–1.
const DISAGREEMENT = 0.3;

export function modelName(model: string): { short: string; full: string } {
  return MODEL_NAMES[model] ?? { short: model, full: model };
}

function number(value: number | null, digits: number): string {
  return value === null ? EMPTY : value.toFixed(digits);
}

function signed(value: number | null, digits: number): string {
  return value === null ? EMPTY : `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

// Shifted by the point's own offset and then read back as UTC, so the times are
// the ones its clocks will show rather than the browser's.
function localDate(day: SunsetDay, forecast: SunsetForecast): Date {
  return new Date((day.time + forecast.utc_offset_seconds) * 1000);
}

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

// One factor of the score, with the weather readings it is worked out from
// listed under it, so a low factor sits right above the reading that caused it.
interface FactorGroup {
  factor: SunsetFactor;
  name: string;
  // What a low value of the factor means, for the tooltip.
  hint: string;
  readings: { name: string; value: (day: SunsetDay) => string }[];
}

// "Sunset" or "Sunrise", for where the word starts a line.
export function eventTitle(event: SunEvent): string {
  return event === 'sunrise' ? 'Sunrise' : 'Sunset';
}

function factorGroups(forecast: SunsetForecast, event: SunEvent): FactorGroup[] {
  const sun = event === 'sunrise' ? 'rising' : 'setting';
  return [
    {
      factor: 'canvas',
      name: 'Canvas',
      hint: 'Mid and high cloud overhead to catch the light. Best at 30–70% cover; low when the sky is clear or overcast.',
      readings: [
        { name: 'High cloud %', value: (day) => number(day.high, 0) },
        { name: 'Mid cloud %', value: (day) => number(day.mid, 0) },
      ],
    },
    {
      factor: 'local_low',
      name: 'Low cloud',
      hint: 'Low cloud overhead blocks the light and stays grey. Low when there is a lot of it.',
      readings: [{ name: 'Low cloud %', value: (day) => number(day.low, 0) }],
    },
    {
      factor: 'horizon',
      name: 'Horizon',
      hint: `Cloud between here and the ${sun} sun, which stops the light arriving. Low when the path is blocked.`,
      readings: forecast.path_points_km.map((km, i) => ({
        name: `Cloud at ${km} km %`,
        value: (day: SunsetDay) => number(day.path_blocks[i] ?? null, 0),
      })),
    },
    {
      factor: 'clarity',
      name: 'Clarity',
      hint: 'Clean, dry air keeps colours vivid. Low when it is humid or hazy.',
      readings: [
        { name: 'Humidity %', value: (day) => number(day.humidity, 0) },
        { name: 'Visibility km', value: (day) => number(day.visibility_km, 0) },
        // The one reading every model shares: aerosols come from a single
        // atmospheric model whichever weather model the rest is from.
        { name: 'Aerosol', value: (day) => number(day.aerosol, 2) },
      ],
    },
    {
      factor: 'rain',
      name: 'Rain',
      hint: `Low when it is raining at ${event}.`,
      readings: [
        { name: 'Rain mm/h', value: (day) => number(day.rain, 1) },
        { name: 'Pressure hPa/6h', value: (day) => signed(day.pressure_change, 1) },
      ],
    },
  ];
}

// Red and amber for the factors dragging a score down, so the eye lands on the
// column and row where two models part company.
function factorColor(value: number | null): string {
  if (value === null) return 'text-slate-600';
  if (value < 0.4) return 'text-red-400';
  if (value < 0.7) return 'text-amber-400';
  return 'text-slate-100';
}

function spread(values: (number | null)[]): number {
  const present = values.filter((value): value is number => value !== null);
  return present.length < 2 ? 0 : Math.max(...present) - Math.min(...present);
}

/**
 * Why the models score one sunset or sunrise differently: every factor of the score for
 * each model, in the same columns as the scores above, with the weather behind
 * each factor underneath it.
 */
function Comparison({ forecast, event, days }: {
  forecast: SunsetForecast;
  event: SunEvent;
  days: (SunsetDay | undefined)[];
}) {
  const groups = factorGroups(forecast, event);
  const columns = days.length + 1;
  const first = days.find((day) => day)!;
  const date = localDate(first, forecast);
  const passed = first.time * 1000 < Date.now();

  const disagreements = groups
    .map((group) => ({ name: group.name, spread: spread(days.map((day) => day?.factors[group.factor] ?? null)) }))
    .filter((group) => group.spread >= DISAGREEMENT)
    .sort((a, b) => b.spread - a.spread);
  const anyBonus = days.some((day) => (day?.bonus ?? 0) > 0);

  return (
    <>
      <tr>
        <td colSpan={columns} className="pt-1 text-left text-slate-400">
          {eventTitle(event)} {formatTime(date)}{passed ? ' (passed)' : ''} toward {COMPASS[Math.round(first.azimuth / 45) % 8]}{' '}
          {Math.round(first.azimuth)}°.{' '}
          {disagreements.length > 0
            ? `The models differ most on ${disagreements.map((group) => group.name.toLowerCase()).join(', ')}.`
            : 'The models broadly agree on what goes into this one.'}
        </td>
      </tr>
      {groups.map((group) => (
        <Fragment key={group.factor}>
          <tr title={group.hint}>
            <th className="pt-1.5 text-left font-medium text-slate-100">{group.name}</th>
            {days.map((day, i) => (
              <td key={i} className={`pt-1.5 font-medium tabular-nums ${factorColor(day?.factors[group.factor] ?? null)}`}>
                {day ? number(day.factors[group.factor], 2) : EMPTY}
              </td>
            ))}
          </tr>
          {group.readings.map((reading) => (
            <tr key={reading.name}>
              <th className="whitespace-nowrap pl-2 text-left font-normal text-slate-500">{reading.name}</th>
              {days.map((day, i) => (
                <td key={i} className="tabular-nums text-slate-400">
                  {day ? reading.value(day) : EMPTY}
                </td>
              ))}
            </tr>
          ))}
        </Fragment>
      ))}
      {anyBonus && (
        <tr title="Added when rain has just cleared and the low cloud is breaking up or the pressure rising">
          <th className="pt-1.5 text-left font-medium text-slate-100">Clearing bonus</th>
          {days.map((day, i) => (
            <td key={i} className="pt-1.5 font-medium tabular-nums text-emerald-400">
              {day && day.bonus > 0 ? `+${day.bonus.toFixed(1)}` : ''}
            </td>
          ))}
        </tr>
      )}
      <tr>
        <td colSpan={columns} className="pb-2"/>
      </tr>
    </>
  );
}

/**
 * Every model's score for every day, side by side: a row per sunset and a column
 * per model. Clicking a row opens the comparison of what each model's score for
 * that sunset is made from.
 */
function ScoreTable({ forecast, event }: { forecast: SunsetForecast; event: SunEvent }) {
  // A model can be missing a day the others have, so the rows are the days any
  // of them has, and each cell is looked up by date rather than by position.
  const dates = [...new Set(forecast.models.flatMap((model) => model.days.map((day) => day.date)))].sort();
  // Opens on the first day, so there is always a worked example on show.
  const [openDate, setOpenDate] = useState<string | null>(dates[0] ?? null);

  return (
    <table className="mt-3 w-full border-separate border-spacing-x-1 border-spacing-y-0.5 text-center text-xs">
      <thead>
        <tr className="text-slate-500">
          <th className="text-left font-normal">{eventTitle(event)}</th>
          {forecast.models.map(({ model }) => (
            <th key={model} className="font-normal" title={modelName(model).full}>
              {modelName(model).short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dates.map((date) => {
          const days = forecast.models.map((model) => model.days.find((day) => day.date === date));
          const first = days.find((day) => day)!;
          const open = openDate === date;
          const toggle = () => setOpenDate(open ? null : date);

          return (
            <Fragment key={date}>
              <tr>
                <th className="whitespace-nowrap text-left font-normal">
                  <button type="button" onClick={toggle} aria-expanded={open} className="text-slate-100 hover:text-white">
                    <span className="inline-block w-3 text-slate-500">{open ? '▾' : '▸'}</span>
                    {formatDay(localDate(first, forecast))}{' '}
                    <span className="text-slate-500">{formatTime(localDate(first, forecast))}</span>
                  </button>
                </th>
                {days.map((day, i) => (
                  <td key={forecast.models[i].model}>
                    {day ? (
                      <button
                        type="button"
                        onClick={toggle}
                        title={`${modelName(forecast.models[i].model).full}: ${day.label}`}
                        className={`w-full rounded px-1 py-1 tabular-nums hover:ring-1 hover:ring-slate-400 ${LABEL_COLOR[day.label]}`}
                      >
                        {day.score.toFixed(1)}
                      </button>
                    ) : (
                      <span className="text-slate-600">{EMPTY}</span>
                    )}
                  </td>
                ))}
              </tr>
              {open && <Comparison forecast={forecast} event={event} days={days}/>}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function Forecast({ forecast, event }: { forecast: SunsetForecast; event: SunEvent }) {
  if (forecast.models.every((model) => model.days.length === 0)) {
    return <p className="mt-3 text-sm text-slate-400">No {event} here in the next few days.</p>;
  }

  return (
    <>
      <ScoreTable forecast={forecast} event={event}/>
      <p className="mt-2 text-xs text-slate-500">
        Weather fetched {new Date(forecast.fetched_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </p>
    </>
  );
}

/**
 * The sunset or sunrise forecast for the point picked on the map. A sibling of the map
 * rather than a layer in it, like the workout panel, so the map never intercepts
 * its clicks and a projection switch does not tear it down.
 */
export default function SunsetPanel({ event, lat, lng, status, onClose }: {
  event: SunEvent;
  lat: number;
  lng: number;
  status: SunsetStatus;
  onClose: () => void;
}) {
  return (
    // Capped and scrolled, as an open comparison is taller than a short window.
    <div className="absolute bottom-3 left-3 z-[1000] max-h-[calc(100%-1.5rem)] w-[26rem] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/90 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-medium text-slate-100">{eventTitle(event)}</h2>
          <p className="text-xs text-slate-400">
            {lat.toFixed(3)}, {lng.toFixed(3)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close forecast"
          className="-mr-1 -mt-1 rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          ✕
        </button>
      </div>

      {status.state === 'loading' && <p className="mt-3 text-sm text-slate-400">Loading forecast…</p>}
      {status.state === 'error' && <p className="mt-3 text-sm text-red-400">{status.message}</p>}
      {status.state === 'done' && <Forecast forecast={status.forecast} event={event}/>}
    </div>
  );
}
