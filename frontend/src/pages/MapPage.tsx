import {useEffect, useRef, useState} from 'react';
import proj4 from 'proj4';
import 'proj4leaflet';
import L from 'leaflet';
import {MapContainer, TileLayer, Pane, Polyline, CircleMarker, useMap, useMapEvent} from 'react-leaflet';
import {appConfig} from '../config.ts';
import type {Workout} from '../api/workouts.ts';
import {useWorkoutStore} from '../store/workoutStore.ts';
import WorkoutDetailPanel from '../components/WorkoutDetailPanel.tsx';
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
    attribution: string;
    projection: Projection;
    maxZoom: number;
}

const BNG_MAX_ZOOM = resolutions.length - 1;
const WEB_MAX_ZOOM = 19;

const OS_TILE_URL = `${appConfig.apiBase}/tiles/{layer}/{z}/{x}/{y}.png`;

function osLayer(name: string, id: string): BaseLayer {
    return {
        name,
        url: OS_TILE_URL.replace('{layer}', id),
        attribution: '&copy; Ordnance Survey',
        projection: 'bng',
        maxZoom: BNG_MAX_ZOOM,
    };
}

const BASE_LAYERS: BaseLayer[] = [
    osLayer('Outdoor', 'Outdoor_27700'),
    osLayer('Leisure', 'Leisure_27700'),
    osLayer('Road', 'Road_27700'),
    osLayer('Light', 'Light_27700'),
    {
        name: 'World',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        projection: 'web',
        maxZoom: WEB_MAX_ZOOM,
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

function MapPersistence({projection, onMove}: {projection: Projection; onMove: (viewport: Viewport) => void}) {
    const map = useMap();
    useEffect(() => {
        const onMoveEnd = () => {
            const {lat, lng} = map.getCenter();
            const viewport: Viewport = {lat, lng, zoom: map.getZoom(), projection};
            localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
            onMove(viewport);
        };
        map.on('moveend', onMoveEnd);
        return () => {
            map.off('moveend', onMoveEnd);
        };
    }, [map, projection, onMove]);
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

// Leaflet's SVG paths have no click tolerance, so a 3px line is fiddly to hit.
// Each track therefore also gets a wide fully-transparent stroke underneath it:
// stroke-opacity 0 still receives pointer events.
const HIT_WEIGHT = 14;

// Track colours have to work over whatever the base map happens to show, and a
// bare line disappears against busy or dark ground (woodland fill on Leisure,
// for instance). So every line is drawn over a wider white casing, which keeps
// the colour itself untouched but always separates it from the map.
const CASING_PANE = 'track-casing';
const CASING_COLOR = '#ffffff';
const CASING_EXTRA_WEIGHT = 2;

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

// Clicking bare map clears the selection. Leaflet stops propagation on
// interactive layers, so this does not fire when a track itself is clicked.
function MapClickClear({onClear}: {onClear: () => void}) {
    useMapEvent('click', onClear);
    return null;
}

function WorkoutTracks() {
    const {workouts, hasMore, loading, loadMore, selectedWorkoutId, selectWorkout} = useWorkoutStore();

    useEffect(() => {
        loadMore();
    }, [loadMore]);

    useEffect(() => {
        if (!loading && hasMore) {
            loadMore();
        }
    }, [loading, hasMore, loadMore]);

    const drawable = workouts
        .map((workout, i) => ({workout, color: TRACK_COLORS[i % TRACK_COLORS.length]}))
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
    const {workouts, selectedWorkoutId, selectWorkout} = useWorkoutStore();
    const selectedWorkout = workouts.find((w) => w.id === selectedWorkoutId) ?? null;

    // Tracks the live view so a projection switch can carry it across, without
    // re-rendering the map on every pan.
    const viewportRef = useRef(viewport);

    const onMove = (next: Viewport) => {
        viewportRef.current = next;
    };

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
                    url={layer.url}
                    maxZoom={layer.maxZoom}
                    attribution={layer.attribution}
                />
            </MapContainer>
        </div>
    );
}
