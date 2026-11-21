import {lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import proj4 from 'proj4';
import 'proj4leaflet';
import L from 'leaflet';
import {MapContainer, TileLayer, Pane, Polyline, Circle, CircleMarker, ZoomControl, useMap, useMapEvent} from 'react-leaflet';
import {appConfig} from '../config.ts';
import {renewIfExpired, useAccessToken} from '../auth/token.ts';
import type {Workout} from '../api/workouts.ts';
import {useWorkoutStore} from '../store/workoutStore.ts';
import {useLocationStore, type Located} from '../store/locationStore.ts';
import WorkoutDetailPanel from '../components/WorkoutDetailPanel.tsx';
import WorkoutFilterBar, {DateRangeSheet} from '../components/WorkoutFilterBar.tsx';
import WorkoutPage, {WORKOUT_PAGE_MAP_TOP, WORKOUT_PAGE_MAP_HEIGHT} from '../components/WorkoutPage.tsx';
import BottomSheet from '../components/BottomSheet.tsx';
import {CalendarIcon, CheckIcon, ChevronUpIcon, LayersIcon, LocateIcon, SpinnerIcon} from '../components/icons.tsx';
import type {DrapedLayer} from '../components/TerrainMap.tsx';
import {rangeLabel} from '../lib/dateRanges.ts';
import {useIsMobile} from '../lib/useIsMobile.ts';
import {paintField, type ScoreField} from '../lib/scoreField.ts';
import {trackColor} from '../lib/trackColor.ts';
import 'leaflet/dist/leaflet.css';

// MapLibre is most of a megabyte, and only the 3D view needs it, so it is fetched
// the first time that view is opened. The page's own "Loading map..." cover stands
// in while it arrives.
const TerrainMap = lazy(() => import('../components/TerrainMap.tsx'));

proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');

const resolutions = [896, 448, 224, 112, 56, 28, 14, 7, 3.5, 1.75, 0.875, 0.4375, 0.21875, 0.109375];

const bngCrs = new L.Proj.CRS(
    'EPSG:27700',
    proj4.defs('EPSG:27700')!,
    {
        resolutions,
        origin: [-238375.0, 1376256.0],
    },
) as unknown as L.CRS;

// A Leaflet map has exactly one CRS, and the OS raster layers we want (Leisure
// in particular) are only published in British National Grid while every
// worldwide open tile source is Web Mercator. So each base layer declares its
// projection, and picking one from a different projection rebuilds the map.
type Projection = 'bng' | 'web';

interface BaseLayer {
    name: string;
    url: string;
    projection: Projection;
    maxZoom: number;
    // Deepest zoom the tile server actually has, when that is shallower than
    // maxZoom. Leaflet upscales the last real tiles past this instead of
    // requesting ones that 404. Omitted when the layer covers its full range.
    maxNativeZoom?: number;
    // Served by our own backend, so the request needs the access token. Public tile
    // servers get nothing.
    authenticated: boolean;
    // Tile edge in pixels, when the source does not serve Leaflet's default 256.
    // A 512px source covers two zoom levels' worth of ground per tile, so it also
    // needs zoomOffset -1 to stay aligned with the standard zoom numbering.
    tileSize?: number;
    zoomOffset?: number;
    // What the 3D view drapes over the terrain in this layer's place, which has to
    // be Web Mercator. Omitted where there is none, which keeps the layer 2D-only.
    terrain?: DrapedLayer;
}

const BNG_MAX_ZOOM = resolutions.length - 1;
const WEB_MAX_ZOOM = 19;
const LEISURE_MAX_NATIVE_ZOOM = 9;

const OS_TILE_URL = `${appConfig.apiBase}/tiles/OS_MAPS/{layer}/{z}/{x}/{y}.png`;

// OS publishes Outdoor, Road and Light in Web Mercator as well, from zoom 7 to 20
// and over Great Britain alone. That is what lets them into the 3D view; Leisure
// is British National Grid only, so it stays out.
const OS_WEB_MIN_ZOOM = 7;
const OS_WEB_MAX_ZOOM = 20;
const OS_WEB_BOUNDS: [number, number, number, number] = [-10.8, 49.5, 1.8, 61.5];

function osLayer(name: string, id: string, webId: string | null, maxNativeZoom?: number): BaseLayer {
    return {
        name,
        url: OS_TILE_URL.replace('{layer}', id),
        projection: 'bng',
        maxZoom: BNG_MAX_ZOOM,
        maxNativeZoom,
        authenticated: true,
        terrain: webId === null ? undefined : {
            url: OS_TILE_URL.replace('{layer}', webId),
            tileSize: 256,
            minzoom: OS_WEB_MIN_ZOOM,
            maxzoom: OS_WEB_MAX_ZOOM,
            bounds: OS_WEB_BOUNDS,
        },
    };
}

// Web Mercator layers drape over the terrain as they are. MapLibre takes a 512px
// tile at the zoom it is addressed by, so the offset Leaflet needs to request it
// becomes part of the source's zoom range instead.
function withTerrain(layer: BaseLayer): BaseLayer {
    return {
        ...layer,
        terrain: {
            url: layer.url,
            tileSize: layer.tileSize ?? 256,
            maxzoom: (layer.maxNativeZoom ?? layer.maxZoom) + (layer.zoomOffset ?? 0),
        },
    };
}

// to keep the map tile endpoint secure need to also include an access_token on the request
// leaflet can't embed the auth header like in existing requests so need to have special
// handling to enable the
function tileUrl(layer: BaseLayer, accessToken: string | null): string {
    if (!layer.authenticated || !accessToken) {
        return layer.url;
    }
    return `${layer.url}?access_token=${encodeURIComponent(accessToken)}`;
}

// The backend asks Mapbox for 512px @2x tiles and passes them through, so the
// tiles arriving here are 512px however our own URL is shaped. That is what the
// -1 zoom offset compensates for: one such tile covers two zoom levels' worth of
// ground, and the offset keeps the map on standard zoom numbering.
const MAPBOX_TILE_SIZE = 512;
const MAPBOX_ZOOM_OFFSET = -1;
const MAPBOX_TILE_URL = `${appConfig.apiBase}/tiles/MAP_BOX/{layer}/{z}/{x}/{y}.png`;

// `styleId` is the Mapbox style the backend appends to its own api-url, so these
// are Mapbox's names for them rather than anything we define.
function mapboxLayer(name: string, styleId: string): BaseLayer {
    return withTerrain({
        name,
        url: MAPBOX_TILE_URL.replace('{layer}', styleId),
        projection: 'web',
        maxZoom: WEB_MAX_ZOOM,
        authenticated: true,
        tileSize: MAPBOX_TILE_SIZE,
        zoomOffset: MAPBOX_ZOOM_OFFSET,
    });
}

const BASE_LAYERS: BaseLayer[] = [
    osLayer('Outdoor', 'Outdoor_27700', 'Outdoor_3857'),
    // Leisure stops at zoom level 9
    osLayer('Leisure', 'Leisure_27700', null, LEISURE_MAX_NATIVE_ZOOM),
    osLayer('Road', 'Road_27700', 'Road_3857'),
    osLayer('Light', 'Light_27700', 'Light_3857'),
    mapboxLayer('Satellite', 'satellite-v9'),
    mapboxLayer('Hybrid', 'satellite-streets-v12'),
    mapboxLayer('Mapbox Outdoors', 'outdoors-v12'),
    withTerrain({
        name: 'World',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        projection: 'web',
        maxZoom: WEB_MAX_ZOOM,
        authenticated: false,
    }),
];

const GB_CENTER: [number, number] = [54.5, -2.5];
const DEFAULT_ZOOM = 2;
const LAYER_STORAGE_KEY = 'map-base-layer';
const VIEWPORT_STORAGE_KEY = 'map-viewport';
const TERRAIN_STORAGE_KEY = 'map-terrain';

// Ground resolution (m/px) of EPSG:3857 zoom 0 at the equator.
const WEB_EQUATOR_RESOLUTION = 156543.03392804097;

interface Viewport {
    lat: number;
    lng: number;
    zoom: number;
    projection: Projection;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

// Web Mercator resolution is latitude-dependent, so both conversions below go
// via true ground resolution — that is what keeps the view at the same apparent
// scale when the map is rebuilt in the other projection.
function webResolution(zoom: number, lat: number): number {
    return (WEB_EQUATOR_RESOLUTION * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function bngZoomToWeb(zoom: number, lat: number): number {
    const resolution = resolutions[clamp(Math.round(zoom), 0, BNG_MAX_ZOOM)];
    const web = Math.log2((WEB_EQUATOR_RESOLUTION * Math.cos((lat * Math.PI) / 180)) / resolution);
    return clamp(Math.round(web), 0, WEB_MAX_ZOOM);
}

function webZoomToBng(zoom: number, lat: number): number {
    const target = webResolution(zoom, lat);
    let nearest = 0;
    for (let i = 1; i < resolutions.length; i++) {
        if (Math.abs(Math.log(resolutions[i] / target)) < Math.abs(Math.log(resolutions[nearest] / target))) {
            nearest = i;
        }
    }
    return nearest;
}

function convertZoom(zoom: number, from: Projection, to: Projection, lat: number): number {
    if (from === to) return zoom;
    return to === 'web' ? bngZoomToWeb(zoom, lat) : webZoomToBng(zoom, lat);
}

function savedLayer(): BaseLayer {
    const saved = localStorage.getItem(LAYER_STORAGE_KEY);
    return BASE_LAYERS.find((l) => l.name === saved) ?? BASE_LAYERS[0];
}

// Only honoured while the layer has a 3D form, so a saved Leisure layer opens flat.
function savedTerrain(layer: BaseLayer): boolean {
    return localStorage.getItem(TERRAIN_STORAGE_KEY) === 'true' && layer.terrain !== undefined;
}

// The projection the map is actually drawn in: the 3D view is always Web
// Mercator, whatever the layer's own 2D projection.
function shownProjection(layer: BaseLayer, terrain: boolean): Projection {
    return terrain ? 'web' : layer.projection;
}

function savedViewport(): Viewport | null {
    try {
        const raw = localStorage.getItem(VIEWPORT_STORAGE_KEY);
        if (!raw) return null;
        const {lat, lng, zoom, projection} = JSON.parse(raw);
        if (typeof lat === 'number' && typeof lng === 'number' && typeof zoom === 'number') {
            // Viewports written before the world layer existed have no
            // projection recorded, and were always British National Grid.
            return {lat, lng, zoom, projection: projection === 'web' ? 'web' : 'bng'};
        }
    } catch { /* ignore */ }
    return null;
}

function initialViewport(projection: Projection): Viewport {
    const saved = savedViewport();
    if (!saved) {
        return {
            lat: GB_CENTER[0],
            lng: GB_CENTER[1],
            zoom: convertZoom(DEFAULT_ZOOM, 'bng', projection, GB_CENTER[0]),
            projection,
        };
    }
    return {
        ...saved,
        zoom: convertZoom(saved.zoom, saved.projection, projection, saved.lat),
        projection,
    };
}

const BOUNDS_DEBOUNCE_MS = 400;

function MapPersistence({projection, onMove}: {projection: Projection; onMove: (viewport: Viewport) => void}) {
    const map = useMap();
    const setBounds = useWorkoutStore((state) => state.setBounds);

    useEffect(() => {
        // Leaflet reports bounds in WGS84 lat/lng whatever the map's CRS, so the
        // British National Grid layers need no reprojection before this is queried on.
        const publishBounds = () => {
            const bounds = map.getBounds();
            setBounds({
                min_lat: bounds.getSouth(),
                max_lat: bounds.getNorth(),
                min_lon: bounds.getWest(),
                max_lon: bounds.getEast(),
            });
        };

        let timer: number | undefined;
        const onMoveEnd = () => {
            const {lat, lng} = map.getCenter();
            onMove({lat, lng, zoom: map.getZoom(), projection});

            window.clearTimeout(timer);
            timer = window.setTimeout(publishBounds, BOUNDS_DEBOUNCE_MS);
        };

        // The first load has to be scoped too, or the map would fetch the whole
        // country before the user has touched it.
        publishBounds();

        map.on('moveend', onMoveEnd);
        return () => {
            window.clearTimeout(timer);
            map.off('moveend', onMoveEnd);
        };
    }, [map, projection, onMove, setBounds]);
    return null;
}

const NO_TERRAIN_HINT = 'Only available in British National Grid, so not in 3D';

// Layers without a 3D form are disabled while the 3D view is on, and the 3D
// toggle while one of them is selected, rather than switching anything silently.
function LayerControl({active, terrain, onSelect, onToggleTerrain}: {
    active: BaseLayer;
    terrain: boolean;
    onSelect: (layer: BaseLayer) => void;
    onToggleTerrain: () => void;
}) {
    return (
        <div className="rounded-lg border border-slate-700 bg-slate-900/90 p-1 shadow-lg backdrop-blur">
            {BASE_LAYERS.map((layer) => {
                const unavailable = terrain && !layer.terrain;
                return (
                    <button
                        key={layer.name}
                        type="button"
                        onClick={() => onSelect(layer)}
                        disabled={unavailable}
                        title={unavailable ? NO_TERRAIN_HINT : undefined}
                        className={`block w-full rounded px-3 py-1.5 text-left text-sm ${
                            layer.name === active.name
                                ? 'bg-slate-700 text-slate-100'
                                : unavailable
                                    ? 'cursor-not-allowed text-slate-600'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                        }`}
                    >
                        {layer.name}
                    </button>
                );
            })}
            <div className="my-1 border-t border-slate-700"/>
            <button
                type="button"
                onClick={onToggleTerrain}
                disabled={!active.terrain}
                title={active.terrain ? undefined : `${active.name}: ${NO_TERRAIN_HINT.toLowerCase()}`}
                className={`block w-full rounded px-3 py-1.5 text-left text-sm ${
                    terrain
                        ? 'bg-sky-700 text-slate-100'
                        : active.terrain
                            ? 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                            : 'cursor-not-allowed text-slate-600'
                }`}
            >
                3D terrain
            </button>
        </div>
    );
}

/** The layer picker as a phone has it: the same choices, in a sheet with rows big enough to tap. */
function LayerSheet({active, terrain, onSelect, onToggleTerrain, onClose}: {
    active: BaseLayer;
    terrain: boolean;
    onSelect: (layer: BaseLayer) => void;
    onToggleTerrain: () => void;
    onClose: () => void;
}) {
    return (
        <BottomSheet title="Map layers" onClose={onClose}>
            <div className="mt-2 flex flex-col gap-1">
                {BASE_LAYERS.map((layer) => {
                    const unavailable = terrain && !layer.terrain;
                    const current = layer.name === active.name;
                    return (
                        <button
                            key={layer.name}
                            type="button"
                            disabled={unavailable}
                            aria-pressed={current}
                            onClick={() => {
                                onSelect(layer);
                                onClose();
                            }}
                            className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 text-left text-base ${
                                current
                                    ? 'bg-slate-800 font-medium text-slate-100'
                                    : unavailable
                                        ? 'text-slate-500'
                                        : 'text-slate-200 active:bg-slate-800'
                            }`}
                        >
                            <span>
                                {layer.name}
                                {unavailable && <span className="block text-xs text-slate-400">Not available in 3D</span>}
                            </span>
                            {current && <CheckIcon className="h-5 w-5 flex-none text-sky-400"/>}
                        </button>
                    );
                })}
            </div>
            <div className="mt-3 border-t border-slate-800 pt-3">
                <button
                    type="button"
                    role="switch"
                    aria-checked={terrain}
                    disabled={!active.terrain}
                    onClick={onToggleTerrain}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left"
                >
                    <span>
                        <span className={`block text-base ${active.terrain ? 'text-slate-100' : 'text-slate-500'}`}>3D terrain</span>
                        {!active.terrain && (
                            <span className="block text-xs text-slate-400">{active.name} is only available flat</span>
                        )}
                    </span>
                    <span className={`relative h-7 w-12 flex-none rounded-full ${terrain ? 'bg-sky-600' : 'bg-slate-700'}`}>
                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${terrain ? 'left-6' : 'left-1'}`}/>
                    </span>
                </button>
            </div>
        </BottomSheet>
    );
}

// How close the map comes in on your location, in Web Mercator zoom numbering:
// close enough to see the paths around you. It never zooms out to get there.
const LOCATE_ZOOM = 15;

/** Where the map should fly to, zoom in Leaflet's Web Mercator numbering. */
export interface FlyTo {
    lat: number;
    lng: number;
    zoom: number;
}

function LocateButton({onLocate, className, label = false}: {
    onLocate: () => void;
    className: string;
    // The desktop button names itself; the phone toolbar's is an icon alone.
    label?: boolean;
}) {
    const locating = useLocationStore((state) => state.locating);
    const Icon = locating ? SpinnerIcon : LocateIcon;

    return (
        <button
            type="button"
            onClick={onLocate}
            aria-label="Show my location"
            title="Show my location"
            aria-busy={locating}
            className={className}
        >
            <Icon className={`h-5 w-5 flex-none ${locating ? 'animate-spin text-slate-400' : 'text-sky-400'}`}/>
            {label && <span>My location</span>}
        </button>
    );
}

/** Why the location could not be found, until it times out or is tapped away. */
function LocateError() {
    const error = useLocationStore((state) => state.error);
    const clearError = useLocationStore((state) => state.clearError);
    if (!error) return null;

    return (
        <button
            type="button"
            onClick={clearError}
            role="alert"
            className="absolute inset-x-3 top-3 z-[1300] rounded-2xl border border-amber-700 bg-slate-900/95 px-4 py-3 text-left text-sm text-amber-200 shadow-lg backdrop-blur md:inset-x-auto md:bottom-6 md:left-1/2 md:top-auto md:max-w-sm md:-translate-x-1/2 md:rounded-lg"
        >
            {error}
        </button>
    );
}

/**
 * The "you are here" dot with its accuracy ring, and the flight to it when the
 * locate button asks. The flight is handed back once made, so a remount for a
 * projection change does not fly there all over again.
 */
function LocateLayer({projection, located, flyTo, onFlown}: {
    projection: Projection;
    located: Located | null;
    flyTo: FlyTo | null;
    onFlown: () => void;
}) {
    const map = useMap();

    useEffect(() => {
        if (!flyTo) return;
        const target = convertZoom(flyTo.zoom, 'web', projection, flyTo.lat);
        map.flyTo([flyTo.lat, flyTo.lng], Math.min(Math.max(map.getZoom(), target), map.getMaxZoom()));
        onFlown();
    }, [map, flyTo, onFlown, projection]);

    if (!located) return null;
    return (
        <>
            <Circle
                center={[located.lat, located.lng]}
                radius={located.accuracy}
                interactive={false}
                pathOptions={{color: '#38bdf8', weight: 1, opacity: 0.6, fillColor: '#38bdf8', fillOpacity: 0.12}}
            />
            <CircleMarker
                center={[located.lat, located.lng]}
                radius={7}
                interactive={false}
                pathOptions={{color: '#ffffff', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1}}
            />
        </>
    );
}

/**
 * Ground to bring into view, and the band of the map that is still showing it.
 * A phone page can cover most of the map and leave a strip uncovered; this fits
 * the ground into that strip rather than into the whole map, half of it hidden.
 */
export interface MapFocus {
    south: number;
    west: number;
    north: number;
    east: number;
    // Pixels from the top of the map to the top of the uncovered strip, and how tall it is.
    top: number;
    height: number;
}

// Room left around the ground, so a track does not run right up to the edges.
const FOCUS_PADDING = 24;
// No closer than this, Web Mercator numbering, for a walk round the block.
const FOCUS_MAX_ZOOM = 16;

function FocusLayer({projection, focus}: {projection: Projection; focus: MapFocus | null}) {
    const map = useMap();

    useEffect(() => {
        if (!focus) return;
        const below = Math.max(map.getSize().y - (focus.top + focus.height), 0);
        map.fitBounds([[focus.south, focus.west], [focus.north, focus.east]], {
            paddingTopLeft: [FOCUS_PADDING, focus.top + FOCUS_PADDING],
            paddingBottomRight: [FOCUS_PADDING, below + FOCUS_PADDING],
            maxZoom: convertZoom(FOCUS_MAX_ZOOM, 'web', projection, (focus.south + focus.north) / 2),
        });
    }, [map, focus, projection]);

    return null;
}

// Classes for the round buttons in the phone toolbar.
export const TOOLBAR_BUTTON =
    'flex h-12 w-12 flex-none items-center justify-center rounded-full text-slate-100 active:bg-slate-800 disabled:text-slate-600';

/**
 * Places something just above the phone toolbar, which runs from 36px to 96px
 * up from the bottom of the map.
 */
export const ABOVE_TOOLBAR = 'bottom-[108px]';

// Leaflet's SVG paths have no click tolerance, so a 3px line is fiddly to hit.
// Each track therefore also gets a wide fully-transparent stroke underneath it:
// stroke-opacity 0 still receives pointer events.
const HIT_WEIGHT = 14;

// Track colours have to work over whatever the base map happens to show, and a
// bare line disappears against busy or dark ground.
// So every line is drawn over a wider white casing, which keeps
// the colour itself untouched but always separates it from the map.
const CASING_PANE = 'track-casing';
const CASING_COLOR = '#ffffff';
const CASING_EXTRA_WEIGHT = 3;

function trackPositions(workout: Workout): [number, number][] {
    return workout.route_points.map((p) => [p.lat, p.lon]);
}

function trackWeight(selected: boolean): number {
    return selected ? 5 : 3;
}

// Leaflet re-fires a layer's mouse events on the map by default, so without
// bubblingMouseEvents={false} below, MapClickClear would wipe the selection in
// the very click that made it.

// The casings live in their own pane, below the pane holding the lines. Within
// one pane Leaflet paints in insertion order, so a casing drawn there would
// cover the line of any track added before it.
function TrackCasing({workout, selected, dimmed}: {workout: Workout; selected: boolean; dimmed: boolean}) {
    return (
        <Polyline
            positions={trackPositions(workout)}
            interactive={false}
            pathOptions={{
                color: CASING_COLOR,
                weight: trackWeight(selected) + CASING_EXTRA_WEIGHT,
                opacity: dimmed ? 0.25 : 0.9,
            }}
        />
    );
}

function Track({workout, color, selected, dimmed, onSelect}: {
    workout: Workout;
    color: string;
    selected: boolean;
    dimmed: boolean;
    onSelect: () => void;
}) {
    const positions = trackPositions(workout);
    const handlers = {click: onSelect};

    return (
        <>
            <Polyline
                positions={positions}
                pathOptions={{color, weight: HIT_WEIGHT, opacity: 0}}
                eventHandlers={handlers}
                bubblingMouseEvents={false}
            />
            <Polyline
                positions={positions}
                pathOptions={{color, weight: trackWeight(selected), opacity: dimmed ? 0.3 : selected ? 1 : 0.8}}
                eventHandlers={handlers}
                bubblingMouseEvents={false}
            />
            {selected && (
                <>
                    <CircleMarker
                        center={positions[0]}
                        radius={6}
                        pathOptions={{color: '#ffffff', weight: 2, fillColor: '#22c55e', fillOpacity: 1}}
                    />
                    <CircleMarker
                        center={positions[positions.length - 1]}
                        radius={6}
                        pathOptions={{color: '#ffffff', weight: 2, fillColor: '#ef4444', fillOpacity: 1}}
                    />
                </>
            )}
        </>
    );
}

// Where the elevation profile is being scrubbed, marked on the route itself.
// Subscribed to the index on its own so that dragging along the profile re-renders
// this one marker rather than every track on the map.
function ScrubMarker({workout}: {workout: Workout}) {
    const index = useWorkoutStore((state) => state.scrubbedPointIndex);
    // A reload while the pointer is down replaces the workout, and the profile's
    // index can briefly outrun the track it came from.
    const point = index === null ? undefined : workout.route_points[index];
    if (!point) return null;

    return (
        <CircleMarker
            center={[point.lat, point.lon]}
            radius={6}
            interactive={false}
            pathOptions={{color: '#ffffff', weight: 3, fillColor: '#38bdf8', fillOpacity: 1}}
        />
    );
}

// The tracks already drawn stay put while a new query runs, so without this there
// is nothing on screen to say the map is fetching a fresh set after a pan.
function LoadingIndicator() {
    return (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1.5 shadow-lg backdrop-blur">
            <span className="flex items-center gap-2 text-sm text-slate-300">
                <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor"
                          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/>
                </svg>
                Loading tracks…
            </span>
        </div>
    );
}

// Clicking bare map clears the selection. Leaflet stops propagation on
// interactive layers, so this does not fire when a track itself is clicked.
function MapClickClear({onClear}: {onClear: () => void}) {
    useMapEvent('click', onClear);
    return null;
}

function WorkoutTracks() {
    // Selected field by field rather than as one object: the scrub index also lives
    // in this store and changes as fast as the pointer moves, and subscribing to the
    // whole state would redraw every polyline along with it.
    const workouts = useWorkoutStore((state) => state.workouts);
    const selectedWorkoutId = useWorkoutStore((state) => state.selectedWorkoutId);
    const selectWorkout = useWorkoutStore((state) => state.selectWorkout);

    const drawable = workouts
        .map((workout) => ({workout, color: trackColor(workout.id)}))
        .filter(({workout}) => (workout.route_points?.length ?? 0) >= 2);

    // Leaflet's SVG renderer paints in insertion order, so the selected track is
    // rendered last to keep it above its neighbours.
    const ordered = [
        ...drawable.filter(({workout}) => workout.id !== selectedWorkoutId),
        ...drawable.filter(({workout}) => workout.id === selectedWorkoutId),
    ];
    const selected = drawable.find(({workout}) => workout.id === selectedWorkoutId)?.workout;

    return (
        <>
            <MapClickClear onClear={() => selectWorkout(null)}/>
            {/* Between the tiles (200) and the default overlay pane (400). */}
            <Pane name={CASING_PANE} style={{zIndex: 350}}>
                {ordered.map(({workout}) => (
                    <TrackCasing
                        key={workout.id}
                        workout={workout}
                        selected={workout.id === selectedWorkoutId}
                        dimmed={selectedWorkoutId !== null && workout.id !== selectedWorkoutId}
                    />
                ))}
            </Pane>
            {ordered.map(({workout, color}) => (
                <Track
                    key={workout.id}
                    workout={workout}
                    color={color}
                    selected={workout.id === selectedWorkoutId}
                    dimmed={selectedWorkoutId !== null && workout.id !== selectedWorkoutId}
                    onSelect={() => selectWorkout(workout.id)}
                />
            ))}
            {/* Last, so insertion order keeps it painted over the tracks. */}
            {selected && <ScrubMarker workout={selected}/>}
        </>
    );
}

const FIELD_PANE = 'score-field';
// Screen pixels per pixel of the picture. The scores vary over kilometres, so a
// coarse picture stretched smooth looks the same as a fine one and paints faster.
const FIELD_SCALE = 4;
// How far past the viewport the picture runs, as a fraction of its size, so a
// drag does not at once pull a bare edge into view. Redrawn when the drag ends.
const FIELD_PADDING = 0.25;
// See-through enough to read the map under it, even where the colour is solid.
const FIELD_OPACITY = 0.65;

/**
 * Colours the map by a field of scores. Drawn on a canvas of its own rather than
 * as a Leaflet image overlay, which could only stretch a picture between two
 * corners: here every pixel is asked where on the ground it is, so the gradient
 * is right in British National Grid as well as Web Mercator.
 */
function ScoreFieldLayer({field}: {field: ScoreField}) {
    const map = useMap();

    useEffect(() => {
        const pane = map.getPane(FIELD_PANE) ?? map.createPane(FIELD_PANE);
        // Between the tiles (200) and everything drawn over them.
        pane.style.zIndex = '250';
        pane.style.pointerEvents = 'none';

        // Hidden while a zoom animates, as it is not scaled along with the tiles.
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide', pane);
        canvas.style.opacity = String(FIELD_OPACITY);

        const draw = () => {
            const size = map.getSize();
            const left = -size.x * FIELD_PADDING;
            const top = -size.y * FIELD_PADDING;
            canvas.width = Math.ceil((size.x * (1 + 2 * FIELD_PADDING)) / FIELD_SCALE);
            canvas.height = Math.ceil((size.y * (1 + 2 * FIELD_PADDING)) / FIELD_SCALE);
            canvas.style.width = `${canvas.width * FIELD_SCALE}px`;
            canvas.style.height = `${canvas.height * FIELD_SCALE}px`;
            // The pane moves with the map as it is dragged, so the canvas is put
            // back over the viewport each time it is repainted.
            L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([left, top]));
            paintField(canvas, field, (x, y) => {
                const {lat, lng} = map.containerPointToLatLng([left + x * FIELD_SCALE, top + y * FIELD_SCALE]);
                return [lat, lng];
            });
        };

        draw();
        map.on('moveend', draw);
        return () => {
            map.off('moveend', draw);
            canvas.remove();
        };
    }, [map, field]);

    return null;
}

// A point chosen by clicking the map, for a page that asks about a place rather
// than a track.
export interface PickedPoint {
    lat: number;
    lng: number;
}

function PickLayer({picked, onPick}: {picked: PickedPoint | null; onPick: (lat: number, lng: number) => void}) {
    const map = useMap();

    // Wrapped, as a Web Mercator map scrolled round the world reports longitudes
    // beyond ±180.
    useMapEvent('click', (event) => {
        const {lat, lng} = event.latlng.wrap();
        onPick(lat, lng);
    });

    // Leaflet's grab cursor says the map can be dragged; this says a click on it
    // does something. Set inline, as Leaflet's own stylesheet outranks ours.
    useEffect(() => {
        const container = map.getContainer();
        container.style.cursor = 'crosshair';
        return () => {
            container.style.cursor = '';
        };
    }, [map]);

    if (!picked) return null;
    return (
        <CircleMarker
            center={[picked.lat, picked.lng]}
            radius={7}
            interactive={false}
            pathOptions={{color: '#ffffff', weight: 3, fillColor: '#f97316', fillOpacity: 1}}
        />
    );
}

interface MapViewProps {
    // Whether the workout tracks are drawn over the map.
    tracks: boolean;
    // Given together to make the map clickable: each click reports where it
    // landed, and the last point chosen stays marked.
    picked?: PickedPoint | null;
    onPick?: (lat: number, lng: number) => void;
    // Scores to colour the map with, under the tracks and markers.
    field?: ScoreField | null;
    // Whatever floats over the map. Rendered outside MapContainer, like the layer
    // control, so the projection remount does not tear it down mid-edit.
    children?: ReactNode;
    // The page's own controls for the start of the phone toolbar, ahead of the
    // layer and location buttons every map has. Unused on a desktop, where the
    // page floats its controls over the map itself.
    toolbar?: ReactNode;
    // Ground to fit into view whenever a new one is given.
    focus?: MapFocus | null;
}

/**
 * The map itself: the base layers, the 2D and 3D views and the saved viewport,
 * shared by every page that shows one.
 */
export function MapView({tracks, picked = null, onPick, field = null, children, toolbar, focus = null}: MapViewProps) {
    const mobile = useIsMobile();
    const [ready, setReady] = useState(false);
    const [layersOpen, setLayersOpen] = useState(false);
    const located = useLocationStore((state) => state.located);
    const locate = useLocationStore((state) => state.locate);
    // Set by the locate button and cleared by whichever map makes the flight.
    const [flyTo, setFlyTo] = useState<FlyTo | null>(null);
    const onFlown = useCallback(() => setFlyTo(null), []);
    const onLocate = useCallback(async () => {
        const position = await locate();
        if (position) setFlyTo({lat: position.lat, lng: position.lng, zoom: LOCATE_ZOOM});
    }, [locate]);
    const [layer, setLayer] = useState(savedLayer);
    const [terrain, setTerrain] = useState(() => savedTerrain(savedLayer()));
    const [viewport, setViewport] = useState(() => {
        const initial = savedLayer();
        return initialViewport(shownProjection(initial, savedTerrain(initial)));
    });
    const accessToken = useAccessToken();

    // Tracks the live view so a projection switch can carry it across, without
    // re-rendering the map on every pan.
    const viewportRef = useRef(viewport);

    const onMove = useCallback((next: Viewport) => {
        localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(next));
        viewportRef.current = next;
    }, []);

    const onTerrainMove = useCallback((lat: number, lng: number, zoom: number) => {
        onMove({lat, lng, zoom, projection: 'web'});
    }, [onMove]);

    const onTerrainReady = useCallback(() => setReady(true), []);

    // Tiles are the one place an expired token can't be caught from a response: they
    // load as images, so all we get is a bare error event. `renewIfExpired` decides
    // whether it really was the token; this only makes sure a viewport's worth of
    // tiles failing together asks once rather than twenty times. The renewal is the
    // retry — a new token rebuilds the URL and Leaflet re-requests from there.
    const renewedFor = useRef<string | null>(null);
    const onTileError = useCallback(() => {
        if (!accessToken || renewedFor.current === accessToken) {
            return;
        }
        renewedFor.current = accessToken;
        renewIfExpired();
    }, [accessToken]);

    // Carries the live view into a newly mounted map, converting its zoom if that
    // map is drawn in the other projection.
    const remountIn = (projection: Projection) => {
        const {lat, lng, zoom, projection: from} = viewportRef.current;
        const converted: Viewport = {lat, lng, zoom: convertZoom(zoom, from, projection, lat), projection};
        viewportRef.current = converted;
        setViewport(converted);
        setReady(false);
    };

    const selectLayer = (next: BaseLayer) => {
        if (terrain && !next.terrain) return;
        localStorage.setItem(LAYER_STORAGE_KEY, next.name);
        // In 3D every layer is Web Mercator, so the 3D map swaps it in place.
        if (shownProjection(next, terrain) !== shownProjection(layer, terrain)) {
            remountIn(shownProjection(next, terrain));
        }
        setLayer(next);
    };

    // Always a remount, even between two Web Mercator maps: 2D is Leaflet and 3D
    // is MapLibre.
    const toggleTerrain = () => {
        const next = !terrain;
        if (next && !layer.terrain) return;
        localStorage.setItem(TERRAIN_STORAGE_KEY, String(next));
        remountIn(shownProjection(layer, next));
        setTerrain(next);
    };

    return (
        <div className="relative h-full">
            {!ready && (
                <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-950 text-sm text-slate-500">
                    Loading map...
                </div>
            )}
            {children}
            {mobile ? (
                <>
                    {/* Clear of the bottom 36px, where the maps keep their attribution. */}
                    <div
                        role="toolbar"
                        aria-label="Map tools"
                        className="absolute inset-x-3 bottom-9 z-[1000] flex h-15 items-center gap-1 rounded-full border border-slate-700 bg-slate-900/95 p-1.5 shadow-xl backdrop-blur"
                    >
                        <div className="flex min-w-0 flex-1 items-center gap-1">{toolbar}</div>
                        <button
                            type="button"
                            aria-label="Map layers"
                            aria-haspopup="dialog"
                            onClick={() => setLayersOpen(true)}
                            className={TOOLBAR_BUTTON}
                        >
                            <LayersIcon className="h-[22px] w-[22px]"/>
                        </button>
                        <LocateButton onLocate={() => void onLocate()} className={TOOLBAR_BUTTON}/>
                    </div>
                    {layersOpen && (
                        <LayerSheet
                            active={layer}
                            terrain={terrain}
                            onSelect={selectLayer}
                            onToggleTerrain={toggleTerrain}
                            onClose={() => setLayersOpen(false)}
                        />
                    )}
                </>
            ) : (
                <div className="absolute right-3 top-3 z-[1000] flex flex-col items-stretch gap-2">
                    <LayerControl active={layer} terrain={terrain} onSelect={selectLayer} onToggleTerrain={toggleTerrain}/>
                    <LocateButton
                        label
                        onLocate={() => void onLocate()}
                        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-left text-sm text-slate-300 shadow-lg backdrop-blur hover:text-slate-100"
                    />
                </div>
            )}
            <LocateError/>
            {terrain && layer.terrain ? (
                <Suspense>
                    <TerrainMap
                        base={layer.terrain}
                        lat={viewport.lat}
                        lng={viewport.lng}
                        zoom={viewport.zoom}
                        maxZoom={WEB_MAX_ZOOM}
                        tracks={tracks}
                        picked={picked}
                        onPick={onPick}
                        field={field}
                        fieldOpacity={FIELD_OPACITY}
                        located={located}
                        flyTo={flyTo}
                        onFlown={onFlown}
                        focus={focus}
                        focusMaxZoom={FOCUS_MAX_ZOOM}
                        focusPadding={FOCUS_PADDING}
                        compactControls={mobile}
                        onMove={onTerrainMove}
                        onReady={onTerrainReady}
                        onTileError={onTileError}
                    />
                </Suspense>
            ) : (
                <MapContainer
                    // Remounts the map when the projection changes; Leaflet cannot
                    // swap a live map's CRS.
                    key={layer.projection}
                    center={[viewport.lat, viewport.lng]}
                    zoom={viewport.zoom}
                    minZoom={0}
                    maxZoom={layer.maxZoom}
                    crs={layer.projection === 'bng' ? bngCrs : L.CRS.EPSG3857}
                    className="h-full w-full"
                    // Leaflet's own zoom control sits top-left, where it is drawn over
                    // the filter bar floating in the same corner. The map's controls
                    // always paint above the overlays, so it is moved rather than
                    // stacked around: bottom-right is the one corner nothing else uses.
                    zoomControl={false}
                    whenReady={() => setReady(true)}
                >
                    {/* A phone pinches to zoom, and the toolbar has that corner. */}
                    {!mobile && <ZoomControl position="bottomright"/>}
                    <MapPersistence projection={layer.projection} onMove={onMove}/>
                    {tracks && <WorkoutTracks/>}
                    {onPick && <PickLayer picked={picked} onPick={onPick}/>}
                    {field && <ScoreFieldLayer field={field}/>}
                    <LocateLayer projection={layer.projection} located={located} flyTo={flyTo} onFlown={onFlown}/>
                    <FocusLayer projection={layer.projection} focus={focus}/>
                    <TileLayer
                        key={layer.name}
                        url={tileUrl(layer, accessToken)}
                        maxZoom={layer.maxZoom}
                        maxNativeZoom={layer.maxNativeZoom}
                        tileSize={layer.tileSize ?? 256}
                        zoomOffset={layer.zoomOffset ?? 0}
                        eventHandlers={{tileerror: onTileError}}
                    />
                </MapContainer>
            )}
        </div>
    );
}

export default function MapPage() {
    // Field by field, for the same reason as WorkoutTracks: this component renders
    // the whole map, and must not be woken by the scrub index changing.
    const workouts = useWorkoutStore((state) => state.workouts);
    const selectedWorkoutId = useWorkoutStore((state) => state.selectedWorkoutId);
    const selectWorkout = useWorkoutStore((state) => state.selectWorkout);
    const setScope = useWorkoutStore((state) => state.setScope);
    const loading = useWorkoutStore((state) => state.loading);
    const needsLoad = useWorkoutStore((state) => state.needsLoad);
    const load = useWorkoutStore((state) => state.load);
    const generation = useWorkoutStore((state) => state.generation);
    // A filter change marks the results stale a render before the request starts, so
    // `loading` alone would blink the indicator off in between.
    const fetching = loading || needsLoad;
    const selectedWorkout = workouts.find((w) => w.id === selectedWorkoutId) ?? null;

    // Tells the store to apply the viewport bounds while this page is the one mounted.
    useEffect(() => {
        setScope('map');
    }, [setScope]);

    // The search answers with every match at once — the viewport bounds keep that
    // small. `generation` re-runs this whenever a filter changes. Up here rather
    // than in either map, as both the 2D and 3D views draw what it loads.
    useEffect(() => {
        if (!loading && needsLoad) {
            load();
        }
    }, [loading, needsLoad, load, generation]);

    const mobile = useIsMobile();
    const focus = useWorkoutFocus(mobile ? selectedWorkout : null);

    if (mobile) {
        return (
            <MapView tracks focus={focus} toolbar={<DateRangeButton/>}>
                <InViewCount fetching={fetching}/>
                {selectedWorkout && (
                    <WorkoutPage workout={selectedWorkout} onBack={() => selectWorkout(null)}/>
                )}
            </MapView>
        );
    }

    return (
        <MapView tracks>
            <WorkoutFilterBar floating/>
            {fetching && <LoadingIndicator/>}
            {selectedWorkout && (
                <WorkoutDetailPanel workout={selectedWorkout} onClose={() => selectWorkout(null)}/>
            )}
        </MapView>
    );
}

/**
 * Where to put the map while a workout's page is open on a phone: its whole
 * track in the strip of map the page leaves showing. Worked out once per track:
 * the workout is replaced by an equal copy whenever the results reload, and a
 * new focus for each would fight the person panning that strip.
 */
function useWorkoutFocus(workout: Workout | null): MapFocus | null {
    const last = useRef<{id: string; focus: MapFocus} | null>(null);
    if (!workout || (workout.route_points?.length ?? 0) < 2) return null;
    if (last.current?.id !== workout.id) {
        const lats = workout.route_points.map((p) => p.lat);
        const lons = workout.route_points.map((p) => p.lon);
        last.current = {
            id: workout.id,
            focus: {
                south: Math.min(...lats),
                north: Math.max(...lats),
                west: Math.min(...lons),
                east: Math.max(...lons),
                top: WORKOUT_PAGE_MAP_TOP,
                height: WORKOUT_PAGE_MAP_HEIGHT,
            },
        };
    }
    return last.current.focus;
}

/** How many workouts the map is showing, or that it is fetching them. */
function InViewCount({fetching}: {fetching: boolean}) {
    const totalElements = useWorkoutStore((state) => state.totalElements);
    return (
        <div
            aria-live="polite"
            className="pointer-events-none absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-2 text-sm text-slate-300 shadow-lg backdrop-blur"
        >
            {fetching ? (
                <>
                    <SpinnerIcon className="h-4 w-4 animate-spin text-slate-400"/>
                    Loading tracks…
                </>
            ) : (
                `${totalElements} ${totalElements === 1 ? 'workout' : 'workouts'} in view`
            )}
        </div>
    );
}

/** The date range in the phone toolbar, opening the sheet that changes it. */
function DateRangeButton() {
    const filters = useWorkoutStore((state) => state.filters);
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
                className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-slate-800 px-4 text-left active:bg-slate-700"
            >
                <CalendarIcon className="h-5 w-5 flex-none text-slate-400"/>
                <span className="truncate text-sm font-semibold text-slate-100">{rangeLabel(filters)}</span>
                <ChevronUpIcon className="ml-auto h-4 w-4 flex-none text-slate-400"/>
            </button>
            {open && <DateRangeSheet onClose={() => setOpen(false)}/>}
        </>
    );
}
