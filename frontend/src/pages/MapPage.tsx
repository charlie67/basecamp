import {useCallback, useEffect, useRef, useState} from 'react';
import proj4 from 'proj4';
import 'proj4leaflet';
import L from 'leaflet';
import {MapContainer, TileLayer, Pane, Polyline, CircleMarker, useMap, useMapEvent} from 'react-leaflet';
import {appConfig} from '../config.ts';
import {renewIfExpired, useAccessToken} from '../auth/token.ts';
import type {Workout} from '../api/workouts.ts';
import {useWorkoutStore} from '../store/workoutStore.ts';
import WorkoutDetailPanel from '../components/WorkoutDetailPanel.tsx';
import WorkoutFilterBar from '../components/WorkoutFilterBar.tsx';
import 'leaflet/dist/leaflet.css';

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
}

const BNG_MAX_ZOOM = resolutions.length - 1;
const WEB_MAX_ZOOM = 19;
const LEISURE_MAX_NATIVE_ZOOM = 9;

const OS_TILE_URL = `${appConfig.apiBase}/tiles/OS_MAPS/{layer}/{z}/{x}/{y}.png`;

function osLayer(name: string, id: string, maxNativeZoom?: number): BaseLayer {
    return {
        name,
        url: OS_TILE_URL.replace('{layer}', id),
        projection: 'bng',
        maxZoom: BNG_MAX_ZOOM,
        maxNativeZoom,
        authenticated: true,
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
    return {
        name,
        url: MAPBOX_TILE_URL.replace('{layer}', styleId),
        projection: 'web',
        maxZoom: WEB_MAX_ZOOM,
        authenticated: true,
        tileSize: MAPBOX_TILE_SIZE,
        zoomOffset: MAPBOX_ZOOM_OFFSET,
    };
}

const BASE_LAYERS: BaseLayer[] = [
    osLayer('Outdoor', 'Outdoor_27700'),
    // Leisure stops at zoom level 9
    osLayer('Leisure', 'Leisure_27700', LEISURE_MAX_NATIVE_ZOOM),
    osLayer('Road', 'Road_27700'),
    osLayer('Light', 'Light_27700'),
    mapboxLayer('Satellite', 'satellite-v9'),
    mapboxLayer('Hybrid', 'satellite-streets-v12'),
    mapboxLayer('Mapbox Outdoors', 'outdoors-v12'),
    {
        name: 'World',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        projection: 'web',
        maxZoom: WEB_MAX_ZOOM,
        authenticated: false,
    },
];

const GB_CENTER: [number, number] = [54.5, -2.5];
const DEFAULT_ZOOM = 2;
const LAYER_STORAGE_KEY = 'map-base-layer';
const VIEWPORT_STORAGE_KEY = 'map-viewport';

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

function initialViewport(layer: BaseLayer): Viewport {
    const saved = savedViewport();
    if (!saved) {
        return {
            lat: GB_CENTER[0],
            lng: GB_CENTER[1],
            zoom: convertZoom(DEFAULT_ZOOM, 'bng', layer.projection, GB_CENTER[0]),
            projection: layer.projection,
        };
    }
    return {
        ...saved,
        zoom: convertZoom(saved.zoom, saved.projection, layer.projection, saved.lat),
        projection: layer.projection,
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
            const viewport: Viewport = {lat, lng, zoom: map.getZoom(), projection};
            localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
            onMove(viewport);

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

function LayerControl({active, onSelect}: {active: BaseLayer; onSelect: (layer: BaseLayer) => void}) {
    return (
        <div className="absolute right-3 top-3 z-[1000] rounded-lg border border-slate-700 bg-slate-900/90 p-1 shadow-lg backdrop-blur">
            {BASE_LAYERS.map((layer) => (
                <button
                    key={layer.name}
                    type="button"
                    onClick={() => onSelect(layer)}
                    className={`block w-full rounded px-3 py-1.5 text-left text-sm ${
                        layer.name === active.name
                            ? 'bg-slate-700 text-slate-100'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                >
                    {layer.name}
                </button>
            ))}
        </div>
    );
}

const TRACK_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#14b8a6'];

// Keyed off the workout's identity rather than its position in the list: filtering
// changes which tracks are loaded, and picking by index would recolour every
// surviving track each time the viewport or date moved.
function trackColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return TRACK_COLORS[Math.abs(hash) % TRACK_COLORS.length];
}

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
    const {workouts, hasMore, loading, loadMore, generation, selectedWorkoutId, selectWorkout} = useWorkoutStore();

    // The map draws every match rather than paging, so it walks the pages until
    // there are none left. Now that the viewport bounds the query this is a small
    // set. `generation` restarts the walk whenever a filter changes.
    useEffect(() => {
        if (!loading && hasMore) {
            loadMore();
        }
    }, [loading, hasMore, loadMore, generation]);

    const drawable = workouts
        .map((workout) => ({workout, color: trackColor(workout.id)}))
        .filter(({workout}) => (workout.route_points?.length ?? 0) >= 2);

    // Leaflet's SVG renderer paints in insertion order, so the selected track is
    // rendered last to keep it above its neighbours.
    const ordered = [
        ...drawable.filter(({workout}) => workout.id !== selectedWorkoutId),
        ...drawable.filter(({workout}) => workout.id === selectedWorkoutId),
    ];

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
        </>
    );
}

export default function MapPage() {
    const [ready, setReady] = useState(false);
    const [layer, setLayer] = useState(savedLayer);
    const [viewport, setViewport] = useState(() => initialViewport(savedLayer()));
    const {workouts, selectedWorkoutId, selectWorkout, setScope, loading, hasMore} = useWorkoutStore();
    const accessToken = useAccessToken();
    // The map walks every page, so `loading` alone drops between them and would
    // blink the indicator. It is only really settled once no pages are left.
    const fetching = loading || hasMore;
    const selectedWorkout = workouts.find((w) => w.id === selectedWorkoutId) ?? null;

    // Tells the store to apply the viewport bounds while this page is the one mounted.
    useEffect(() => {
        setScope('map');
    }, [setScope]);

    // Tracks the live view so a projection switch can carry it across, without
    // re-rendering the map on every pan.
    const viewportRef = useRef(viewport);

    const onMove = (next: Viewport) => {
        viewportRef.current = next;
    };

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

    const selectLayer = (next: BaseLayer) => {
        localStorage.setItem(LAYER_STORAGE_KEY, next.name);
        if (next.projection !== layer.projection) {
            const {lat, lng, zoom} = viewportRef.current;
            const converted: Viewport = {
                lat,
                lng,
                zoom: convertZoom(zoom, layer.projection, next.projection, lat),
                projection: next.projection,
            };
            viewportRef.current = converted;
            setViewport(converted);
            setReady(false);
        }
        setLayer(next);
    };

    return (
        <div className="relative h-full">
            {!ready && (
                <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-950 text-sm text-slate-500">
                    Loading map...
                </div>
            )}
            {/* Outside MapContainer, like the controls below, so the projection
                remount does not tear the filter down mid-edit. */}
            <WorkoutFilterBar floating/>
            {fetching && <LoadingIndicator/>}
            <LayerControl active={layer} onSelect={selectLayer}/>
            {selectedWorkout && (
                <WorkoutDetailPanel workout={selectedWorkout} onClose={() => selectWorkout(null)}/>
            )}
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
                whenReady={() => setReady(true)}
            >
                <MapPersistence projection={layer.projection} onMove={onMove}/>
                <WorkoutTracks/>
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
        </div>
    );
}
