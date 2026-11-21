import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {ABOVE_TOOLBAR, MapView, TOOLBAR_BUTTON, type PickedPoint} from './MapPage.tsx';
import SunsetPanel, {eventTitle, modelName, type OpenDate, type SunsetStatus} from '../components/SunsetPanel.tsx';
import ForecastPage, {ForecastCallout} from '../components/ForecastPage.tsx';
import {SpinnerIcon, SunriseIcon, SunsetIcon} from '../components/icons.tsx';
import {useIsMobile} from '../lib/useIsMobile.ts';
import {
    AreaTooLargeError,
    fetchSunsetForecast,
    fetchSunsetMap,
    type SunEvent,
    type SunsetMap,
    type SunsetMapDay,
} from '../api/sunset.ts';
import {SCORE_GRADIENT_CSS, type ScoreField} from '../lib/scoreField.ts';
import {useWorkoutStore} from '../store/workoutStore.ts';

const OVERLAY_STORAGE_KEY = 'sunset-overlay';
// How long after a failure the scores are asked for again. The weather
// provider's rate limit, the likeliest cause, is counted per minute.
const RETRY_MS = 60_000;

type OverlayStatus =
    | {state: 'idle'}
    | {state: 'loading'}
    | {state: 'error'; message: string}
    // More ground in view than the backend will score at once.
    | {state: 'too-wide'; message: string};

function dayName(day: SunsetMapDay, index: number): string {
    if (index === 0) return 'Today';
    if (index === 1) return 'Tomorrow';
    return new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {weekday: 'long', timeZone: 'UTC'});
}

// Shifted by the place's own offset and read back as UTC, as the forecast panel
// does, so the time is the one its clocks will show.
function sunsetTime(day: SunsetMapDay): string {
    return new Date((day.time + day.utc_offset_seconds) * 1000)
        .toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
}

/**
 * What the colours on the map mean, which evening they are for, and the switch
 * that turns them off.
 */
function Legend({event, enabled, onToggle, map, status, dayIndex, onDay}: {
    event: SunEvent;
    enabled: boolean;
    onToggle: () => void;
    map: SunsetMap | null;
    status: OverlayStatus;
    dayIndex: number;
    onDay: (index: number) => void;
}) {
    const day = map?.days[dayIndex];

    return (
        <div className="absolute left-3 top-3 z-[1000] w-64 max-w-[calc(100%-1.5rem)] rounded-lg border border-slate-700 bg-slate-900/90 p-3 text-sm text-slate-300 shadow-lg backdrop-blur">
            <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="font-medium text-slate-100">{eventTitle(event)} quality</span>
                <input type="checkbox" checked={enabled} onChange={onToggle} className="h-4 w-4 accent-orange-500"/>
            </label>

            {enabled && (
                <>
                    {map && map.days.length > 0 && (
                        <div className="mt-2 flex gap-1">
                            {map.days.map((each, index) => (
                                <button
                                    key={each.date}
                                    type="button"
                                    onClick={() => onDay(index)}
                                    aria-pressed={index === dayIndex}
                                    className={`flex-1 rounded px-2 py-1 text-xs ${
                                        index === dayIndex
                                            ? 'bg-slate-700 text-slate-100'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                                    }`}
                                >
                                    {dayName(each, index)}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="mt-3 h-2.5 rounded-full" style={{background: SCORE_GRADIENT_CSS}}/>
                    <div className="mt-1 flex justify-between text-xs text-slate-400">
                        <span>Dull</span>
                        <span>Fair</span>
                        <span>Excellent</span>
                    </div>

                    {status.state === 'error' && <p className="mt-2 text-xs text-red-400">{status.message}</p>}
                    {status.state === 'too-wide' && <p className="mt-2 text-xs text-amber-400">{status.message}</p>}
                    {status.state === 'loading' && !map && <p className="mt-2 text-xs text-slate-400">Loading scores…</p>}
                    {map && day && (
                        <p className="mt-2 text-xs text-slate-500" title={modelName(map.model).full}>
                            {eventTitle(event)} {day.time * 1000 < Date.now() ? 'was ' : ''}about {sunsetTime(day)}
                            {' · '}{modelName(map.model).short} forecast
                            {status.state === 'loading' ? ' · updating…' : ''}
                        </p>
                    )}
                    {map && map.days.length === 0 && (
                        <p className="mt-2 text-xs text-slate-400">No {event} here in the next few days.</p>
                    )}
                </>
            )}

            <p className="mt-2 border-t border-slate-700 pt-2 text-xs text-slate-400">
                Click the map for the full forecast at a point
            </p>
        </div>
    );
}

// The phone toolbar has room for a word per day, so the days after tomorrow go
// by their short weekday.
function shortDayName(day: SunsetMapDay, index: number): string {
    if (index === 0) return 'Today';
    return new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {weekday: 'short', timeZone: 'UTC'});
}

const GRADIENT_LABELS = (
    <span className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>Dull</span>
        <span>Fair</span>
        <span>Excellent</span>
    </span>
);

/**
 * The phone's legend: just what the colours mean and how the scores are doing,
 * as the day and the on/off switch live in the toolbar.
 */
function MobileLegend({event, enabled, map, status, dayIndex, picked}: {
    event: SunEvent;
    enabled: boolean;
    map: SunsetMap | null;
    status: OverlayStatus;
    dayIndex: number;
    picked: boolean;
}) {
    const day = map?.days[dayIndex];
    let note: ReactNode = null;
    if (enabled && status.state === 'error') note = <span className="text-red-300">{status.message}</span>;
    else if (enabled && status.state === 'too-wide') note = <span className="text-amber-300">{status.message}</span>;
    else if (enabled && map && map.days.length === 0) note = `No ${event} here in the next few days.`;
    else if (enabled && map && day) {
        note = `${eventTitle(event)} ${day.time * 1000 < Date.now() ? 'was ' : ''}about ${sunsetTime(day)} · ${modelName(map.model).short}`;
    }

    return (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] w-60 max-w-[calc(100%-1.5rem)] rounded-2xl bg-slate-900/90 px-3 py-2 text-xs text-slate-300 shadow-lg backdrop-blur">
            {enabled && (
                <>
                    <span className="block h-1.5 rounded-full" style={{background: SCORE_GRADIENT_CSS}}/>
                    {GRADIENT_LABELS}
                </>
            )}
            {note && <p className={enabled ? 'mt-1' : ''}>{note}</p>}
            {!picked && <p className={enabled || note ? 'mt-1 text-slate-400' : ''}>Tap the map for the forecast there</p>}
        </div>
    );
}

/** The days the overlay can show and its on/off switch, for the start of the phone toolbar. */
function OverlayControls({event, enabled, onToggle, map, status, dayIndex, onDay}: {
    event: SunEvent;
    enabled: boolean;
    onToggle: () => void;
    map: SunsetMap | null;
    status: OverlayStatus;
    dayIndex: number;
    onDay: (index: number) => void;
}) {
    const Icon = event === 'sunrise' ? SunriseIcon : SunsetIcon;

    return (
        <>
            <div role="group" aria-label="Day shown on the map" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
                {!enabled ? (
                    <span className="px-3 text-sm text-slate-400">Quality overlay off</span>
                ) : map && map.days.length > 0 ? (
                    map.days.map((each, index) => (
                        <button
                            key={each.date}
                            type="button"
                            onClick={() => onDay(index)}
                            aria-pressed={index === dayIndex}
                            className={`h-12 flex-none rounded-full px-3.5 text-sm ${
                                index === dayIndex
                                    ? 'bg-slate-700 font-semibold text-slate-100'
                                    : 'text-slate-300 active:bg-slate-800'
                            }`}
                        >
                            {shortDayName(each, index)}
                        </button>
                    ))
                ) : status.state === 'loading' ? (
                    <span className="flex items-center gap-2 px-3 text-sm text-slate-400">
                        <SpinnerIcon className="h-4 w-4 animate-spin"/>
                        Loading scores…
                    </span>
                ) : null}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`Show ${event} quality on the map`}
                onClick={onToggle}
                className={`${TOOLBAR_BUTTON} ${enabled ? 'bg-orange-900 text-orange-300' : ''}`}
            >
                <Icon className="h-[22px] w-[22px]"/>
            </button>
        </>
    );
}

/**
 * The map without the workouts, coloured by how good the sunset is likely to be
 * across it. Clicking anywhere gives the full forecast for that point. The same
 * page serves the sunrise: the route mounts it afresh for each, so nothing of one
 * is ever shown as the other.
 */
export default function SunsetPage({event}: {event: SunEvent}) {
    const mobile = useIsMobile();
    const [picked, setPicked] = useState<PickedPoint | null>(null);
    // On a phone, whether the picked point's full forecast page is open.
    const [forecastOpen, setForecastOpen] = useState(false);
    const [status, setStatus] = useState<SunsetStatus>({state: 'loading'});
    // The day open in the forecast panel, kept here so moving to another point
    // stays on it rather than going back to the first.
    const [openDate, setOpenDate] = useState<OpenDate>(undefined);

    const [overlay, setOverlay] = useState(() => localStorage.getItem(OVERLAY_STORAGE_KEY) !== 'false');
    const [overlayStatus, setOverlayStatus] = useState<OverlayStatus>({state: 'idle'});
    const [sunsetMap, setSunsetMap] = useState<SunsetMap | null>(null);
    // Null until a day is picked by hand. Until then the map shows the next one
    // still to come, as today's is no use once it has passed.
    const [dayChoice, setDayChoice] = useState<number | null>(null);
    // Bumped to ask again a while after a request has failed.
    const [retry, setRetry] = useState(0);
    // Both maps already publish what they show here, debounced, for the workout
    // search. The overlay wants the same thing, so it reads it rather than have
    // them report it twice.
    const bounds = useWorkoutStore((state) => state.bounds);

    const onPick = useCallback((lat: number, lng: number) => {
        // Set here rather than in the effect, so a second click never shows the
        // previous point's forecast under the new point's coordinates.
        setStatus({state: 'loading'});
        setPicked({lat, lng});
    }, []);

    useEffect(() => {
        if (!picked) return;

        const controller = new AbortController();
        fetchSunsetForecast(event, picked.lat, picked.lng, controller.signal)
            .then((forecast) => setStatus({state: 'done', forecast}))
            .catch((error: unknown) => {
                // Aborted by a newer click, whose own request will report instead.
                if (controller.signal.aborted) return;
                setStatus({state: 'error', message: error instanceof Error ? error.message : 'Forecast failed'});
            });
        return () => controller.abort();
    }, [event, picked]);

    // Asked for again on every move. The scores already on the map stay until the
    // new ones land, and the backend answers from its cache where the views overlap.
    useEffect(() => {
        if (!overlay || !bounds) return;
        if (!(bounds.min_lat < bounds.max_lat) || !(bounds.min_lon < bounds.max_lon)) return;

        const controller = new AbortController();
        let retryTimer: number | undefined;
        setOverlayStatus({state: 'loading'});
        fetchSunsetMap(
            event,
            {south: bounds.min_lat, west: bounds.min_lon, north: bounds.max_lat, east: bounds.max_lon},
            controller.signal,
        )
            .then((map) => {
                setSunsetMap(map);
                setOverlayStatus({state: 'idle'});
            })
            .catch((error: unknown) => {
                // Aborted by a newer move, whose own request will report instead.
                if (controller.signal.aborted) return;
                if (error instanceof AreaTooLargeError) {
                    // Scores for a fraction of what is now in view would only mislead.
                    setSunsetMap(null);
                    setOverlayStatus({state: 'too-wide', message: error.message});
                    return;
                }
                setOverlayStatus({state: 'error', message: error instanceof Error ? error.message : 'Sunset map failed'});
                // Whatever went wrong upstream tends to pass, and the backend keeps what
                // it did fetch, so a second go has less to ask for.
                retryTimer = window.setTimeout(() => setRetry((count) => count + 1), RETRY_MS);
            });
        return () => {
            window.clearTimeout(retryTimer);
            controller.abort();
        };
    }, [event, overlay, bounds, retry]);

    const toggleOverlay = () => {
        localStorage.setItem(OVERLAY_STORAGE_KEY, String(!overlay));
        setOverlay(!overlay);
    };

    const upcoming = sunsetMap ? sunsetMap.days.findIndex((day) => day.time * 1000 > Date.now()) : -1;
    // A day can drop off the end between one answer and the next.
    const shownDay = sunsetMap ? Math.min(dayChoice ?? Math.max(upcoming, 0), sunsetMap.days.length - 1) : 0;
    const scores = sunsetMap?.days[shownDay]?.scores;
    // Memoised, as the maps repaint whenever they are handed a new field.
    const field = useMemo<ScoreField | null>(() => {
        if (!overlay || !sunsetMap || !scores) return null;
        return {
            south: sunsetMap.south,
            west: sunsetMap.west,
            latStep: sunsetMap.lat_step,
            lonStep: sunsetMap.lon_step,
            rows: sunsetMap.rows,
            cols: sunsetMap.cols,
            values: scores,
        };
    }, [overlay, sunsetMap, scores]);

    const closePoint = () => {
        setPicked(null);
        setForecastOpen(false);
    };

    if (mobile) {
        return (
            <MapView
                tracks={false}
                picked={picked}
                onPick={onPick}
                field={field}
                toolbar={
                    <OverlayControls
                        event={event}
                        enabled={overlay}
                        onToggle={toggleOverlay}
                        map={sunsetMap}
                        status={overlayStatus}
                        dayIndex={shownDay}
                        onDay={setDayChoice}
                    />
                }
            >
                <MobileLegend
                    event={event}
                    enabled={overlay}
                    map={sunsetMap}
                    status={overlayStatus}
                    dayIndex={shownDay}
                    picked={picked !== null}
                />
                {picked && (
                    <ForecastCallout
                        event={event}
                        lat={picked.lat}
                        lng={picked.lng}
                        status={status}
                        openDate={openDate}
                        onOpen={() => setForecastOpen(true)}
                        onClose={closePoint}
                        className={ABOVE_TOOLBAR}
                    />
                )}
                {picked && forecastOpen && (
                    <ForecastPage
                        event={event}
                        lat={picked.lat}
                        lng={picked.lng}
                        status={status}
                        openDate={openDate}
                        onOpenDate={setOpenDate}
                        onBack={() => setForecastOpen(false)}
                    />
                )}
            </MapView>
        );
    }

    return (
        <MapView tracks={false} picked={picked} onPick={onPick} field={field}>
            <Legend
                event={event}
                enabled={overlay}
                onToggle={toggleOverlay}
                map={sunsetMap}
                status={overlayStatus}
                dayIndex={shownDay}
                onDay={setDayChoice}
            />
            {picked && (
                <SunsetPanel
                    event={event}
                    lat={picked.lat}
                    lng={picked.lng}
                    status={status}
                    openDate={openDate}
                    onOpenDate={setOpenDate}
                    onClose={() => setPicked(null)}
                />
            )}
        </MapView>
    );
}
