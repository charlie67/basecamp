import { useState } from 'react';
import type { SunEvent, SunsetDay, SunsetForecast } from '../api/sunset.ts';
import {
  DISAGREEMENT,
  EMPTY,
  LABEL_COLOR,
  compassPoint,
  eventTitle,
  factorColor,
  factorGroups,
  formatDay,
  formatTime,
  localDate,
  modelName,
  number,
  scoreLabel,
  spread,
  type OpenDate,
  type SunsetStatus,
} from './SunsetPanel.tsx';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, SpinnerIcon } from './icons.tsx';

/** One sunset or sunrise as every model has it, lined up by the local day. */
interface ForecastDay {
  date: string;
  // One per model, in the forecast's model order; undefined where a model has
  // nothing for the day.
  days: (SunsetDay | undefined)[];
  // The first model that has the day, for what they all share: its time and
  // where the sun is.
  first: SunsetDay;
  // The models' scores averaged, as the one figure for the day.
  mean: number;
}

function average(values: (number | null | undefined)[]): number | null {
  const present = values.filter((value): value is number => typeof value === 'number');
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0) / present.length;
}

function forecastDays(forecast: SunsetForecast): ForecastDay[] {
  const dates = [...new Set(forecast.models.flatMap((model) => model.days.map((day) => day.date)))].sort();
  return dates.map((date) => {
    const days = forecast.models.map((model) => model.days.find((day) => day.date === date));
    return {
      date,
      days,
      first: days.find((day) => day)!,
      mean: average(days.map((day) => day?.score))!,
    };
  });
}

/**
 * The day to show: the one picked, while this point has it, or else the next
 * one still to come, as one already passed is no use for planning.
 */
function shownDay(days: ForecastDay[], openDate: OpenDate): ForecastDay | undefined {
  return (
    days.find((day) => day.date === openDate) ??
    days.find((day) => day.first.time * 1000 > Date.now()) ??
    days[0]
  );
}

// "Today" and "Tomorrow" by the point's own calendar, which the date already is.
function relativeDay(day: ForecastDay, forecast: SunsetForecast): string {
  const localNow = new Date(Date.now() + forecast.utc_offset_seconds * 1000);
  const today = localNow.toISOString().slice(0, 10);
  localNow.setUTCDate(localNow.getUTCDate() + 1);
  const tomorrow = localNow.toISOString().slice(0, 10);
  if (day.date === today) return 'Today';
  if (day.date === tomorrow) return 'Tomorrow';
  return formatDay(localDate(day.first, forecast));
}

function ScoreChip({ score, className }: { score: number; className: string }) {
  const label = scoreLabel(score);
  return (
    <span className={`flex flex-none flex-col items-center justify-center tabular-nums ${LABEL_COLOR[label]} ${className}`}>
      <span className="font-bold leading-none">{score.toFixed(1)}</span>
      <span className="mt-0.5 text-[11px] font-semibold">{label}</span>
    </span>
  );
}

/**
 * A summary of the point picked on the map, floating above the phone toolbar:
 * the score for the coming sunset, and the way into the full forecast.
 */
export function ForecastCallout({
  event,
  lat,
  lng,
  status,
  openDate,
  onOpen,
  onClose,
  className,
}: {
  event: SunEvent;
  lat: number;
  lng: number;
  status: SunsetStatus;
  openDate: OpenDate;
  onOpen: () => void;
  onClose: () => void;
  className: string;
}) {
  const forecast = status.state === 'done' ? status.forecast : null;
  const day = forecast ? shownDay(forecastDays(forecast), openDate) : undefined;
  const coordinates = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;

  return (
    <div
      className={`absolute inset-x-3 z-[1050] flex items-center gap-1 rounded-2xl border border-slate-700 bg-slate-900/95 p-2 shadow-xl backdrop-blur ${className}`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={!day}
        aria-label={day ? `Open the full ${event} forecast` : undefined}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left active:bg-slate-800"
      >
        {status.state === 'loading' && (
          <>
            <SpinnerIcon className="h-6 w-6 flex-none animate-spin text-slate-400" />
            <span className="min-w-0">
              <span className="block text-base text-slate-200">Loading forecast…</span>
              <span className="block truncate text-sm text-slate-400">{coordinates}</span>
            </span>
          </>
        )}
        {status.state === 'error' && (
          <span className="min-w-0">
            <span className="block text-base text-red-300">{status.message}</span>
            <span className="block truncate text-sm text-slate-400">{coordinates}</span>
          </span>
        )}
        {forecast && !day && (
          <span className="text-base text-slate-300">No {event} here in the next few days.</span>
        )}
        {forecast && day && (
          <>
            <ScoreChip score={day.mean} className="h-12 w-12 rounded-xl text-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-slate-100">
                {relativeDay(day, forecast)} · {formatTime(localDate(day.first, forecast))}
              </span>
              <span className="block truncate text-sm text-slate-400">
                Toward {compassPoint(day.first.azimuth)} · {coordinates}
              </span>
            </span>
            <ChevronRightIcon className="h-6 w-6 flex-none text-orange-300" />
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close forecast"
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-400 active:bg-slate-800"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

function barColor(value: number | null): string {
  if (value === null) return 'bg-slate-700';
  if (value < 0.4) return 'bg-red-400';
  if (value < 0.7) return 'bg-amber-400';
  return 'bg-slate-300';
}

/**
 * What one day's score is made from: each factor averaged over the models, and
 * opened up, every model's value for it with the weather readings behind it.
 */
function Breakdown({ forecast, event, day }: { forecast: SunsetForecast; event: SunEvent; day: ForecastDay }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = factorGroups(forecast, event);
  const models = forecast.models.map(({ model }) => modelName(model));
  const columns = { gridTemplateColumns: `minmax(0, 1fr) repeat(${models.length}, 3.25rem)` };
  const bonuses = day.days
    .map((each, i) => ({ model: models[i].short, bonus: each?.bonus ?? 0 }))
    .filter((each) => each.bonus > 0);

  return (
    <div className="flex flex-col">
      {groups.map((group) => {
        const values = day.days.map((each) => each?.factors[group.factor] ?? null);
        const mean = average(values);
        const apart = spread(values);
        const expanded = open === group.factor;

        return (
          <div key={group.factor} className="border-b border-slate-800 last:border-b-0">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : group.factor)}
              className="grid min-h-12 w-full grid-cols-[6.5rem_minmax(0,1fr)_2.75rem_1.25rem] items-center gap-3 text-left"
            >
              <span className="text-base text-slate-100">
                {group.name}
                {apart >= DISAGREEMENT && <span className="block text-xs text-amber-300">Models differ</span>}
              </span>
              <span className="h-1.5 rounded-full bg-slate-800">
                <span
                  className={`block h-1.5 rounded-full ${barColor(mean)}`}
                  style={{ width: `${Math.round((mean ?? 0) * 100)}%` }}
                />
              </span>
              <span className={`text-right text-base tabular-nums ${factorColor(mean)}`}>{number(mean, 2)}</span>
              <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
              <div className="mb-3 rounded-xl bg-slate-900 p-3 text-sm">
                <p className="text-slate-300">{group.hint}</p>
                <div className="mt-3 grid gap-x-1 gap-y-1.5 text-center tabular-nums" style={columns}>
                  <span />
                  {models.map((model) => (
                    <span key={model.short} className="truncate text-xs text-slate-400" title={model.full}>
                      {model.short}
                    </span>
                  ))}
                  <span className="text-left font-medium text-slate-100">{group.name}</span>
                  {values.map((value, i) => (
                    <span key={i} className={`font-medium ${factorColor(value)}`}>
                      {number(value, 2)}
                    </span>
                  ))}
                  {group.readings.map((reading) => (
                    <div key={reading.name} className="contents">
                      <span className="text-left leading-tight text-slate-400">{reading.name}</span>
                      {day.days.map((each, i) => (
                        <span key={i} className="text-slate-300">
                          {each ? reading.value(each) : EMPTY}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {bonuses.length > 0 && (
        <p className="mt-3 text-sm text-emerald-300">
          Clearing bonus: {bonuses.map((each) => `+${each.bonus.toFixed(1)} ${each.model}`).join(', ')}. Rain has just
          cleared and the low cloud is breaking up.
        </p>
      )}
    </div>
  );
}

/**
 * The full forecast for a point, on a phone: a day at a time, picked from tabs
 * across the top, with the one score for it, each model's, and what went into
 * them. The desktop shows the same in its table; on a phone that table is too
 * narrow to tap.
 */
export default function ForecastPage({
  event,
  lat,
  lng,
  status,
  openDate,
  onOpenDate,
  onBack,
}: {
  event: SunEvent;
  lat: number;
  lng: number;
  status: SunsetStatus;
  openDate: OpenDate;
  onOpenDate: (date: string | null) => void;
  onBack: () => void;
}) {
  const forecast = status.state === 'done' ? status.forecast : null;
  const days = forecast ? forecastDays(forecast) : [];
  const day = shownDay(days, openDate);

  return (
    <div className="absolute inset-0 z-[1100] flex flex-col bg-slate-950">
      <header className="flex h-16 flex-none items-center gap-1 border-b border-slate-800 pl-1 pr-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to map"
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full text-slate-100 active:bg-slate-800"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-100">{eventTitle(event)} forecast</h1>
          <p className="truncate text-sm text-slate-400">
            {lat.toFixed(3)}, {lng.toFixed(3)}
            {forecast &&
              ` · weather from ${new Date(forecast.fetched_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
      </header>

      {status.state === 'loading' && <p className="p-4 text-base text-slate-400">Loading forecast…</p>}
      {status.state === 'error' && <p className="p-4 text-base text-red-300">{status.message}</p>}
      {forecast && !day && <p className="p-4 text-base text-slate-300">No {event} here in the next few days.</p>}

      {forecast && day && (
        <>
          <div role="tablist" aria-label="Day" className="flex flex-none gap-2 overflow-x-auto px-4 py-3">
            {days.map((each) => {
              const selected = each.date === day.date;
              const label = scoreLabel(each.mean);
              return (
                <button
                  key={each.date}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onOpenDate(each.date)}
                  className={`flex h-[72px] w-20 flex-none flex-col items-center justify-center gap-1.5 rounded-2xl border-2 ${
                    selected ? 'border-orange-500 bg-slate-800' : 'border-transparent bg-slate-900'
                  }`}
                >
                  <span className={`text-sm ${selected ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
                    {formatDay(localDate(each.first, forecast))}
                  </span>
                  <span className={`rounded-lg px-2 py-0.5 text-sm font-bold tabular-nums ${LABEL_COLOR[label]}`}>
                    {each.mean.toFixed(1)}
                  </span>
                </button>
              );
            })}
          </div>

          <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-1">
            <DayDetail forecast={forecast} event={event} day={day} />
          </div>
        </>
      )}
    </div>
  );
}

function DayDetail({ forecast, event, day }: { forecast: SunsetForecast; event: SunEvent; day: ForecastDay }) {
  const label = scoreLabel(day.mean);
  const scored = day.days.filter((each): each is SunsetDay => each !== undefined);
  const agreeing = scored.filter((each) => each.label === label).length;
  const passed = day.first.time * 1000 < Date.now();
  const reasons = [...new Set(scored.flatMap((each) => each.reasons))];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <ScoreChip score={day.mean} className="h-24 w-24 rounded-3xl text-4xl" />
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums text-slate-100">
            {formatTime(localDate(day.first, forecast))}
            {passed && <span className="ml-2 text-base font-normal text-slate-400">passed</span>}
          </p>
          <p className="mt-0.5 text-base text-slate-300">
            {event === 'sunrise' ? 'Rises' : 'Sets'} toward {compassPoint(day.first.azimuth)},{' '}
            {Math.round(day.first.azimuth)}°
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {agreeing} of {scored.length} {scored.length === 1 ? 'model says' : 'models say'} {label}
          </p>
        </div>
      </div>

      <section aria-labelledby="by-model">
        <h2 id="by-model" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          By model
        </h2>
        <div className="flex flex-col gap-3">
          {forecast.models.map(({ model }, i) => {
            const each = day.days[i];
            return (
              <div key={model} className="grid grid-cols-[9.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
                <span className="truncate text-sm text-slate-100" title={modelName(model).full}>
                  {modelName(model).full}
                </span>
                <span className="h-2.5 rounded-full bg-slate-800">
                  {each && (
                    <span
                      className={`block h-2.5 rounded-full ${LABEL_COLOR[each.label]}`}
                      style={{ width: `${Math.max(each.score * 10, 2)}%` }}
                    />
                  )}
                </span>
                <span className="text-right text-base font-semibold tabular-nums text-slate-100">
                  {each ? each.score.toFixed(1) : EMPTY}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="why" className="border-t border-slate-800 pt-5">
        <h2 id="why" className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Why
        </h2>
        {reasons.length > 0 && (
          <ul className="mb-2 list-disc pl-5 text-sm text-slate-300">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        <Breakdown key={day.date} forecast={forecast} event={event} day={day} />
      </section>
    </div>
  );
}
