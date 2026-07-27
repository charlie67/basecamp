import {useEffect, useState} from 'react';
import proj4 from 'proj4';
import 'proj4leaflet';
import L from 'leaflet';
import {MapContainer, TileLayer, LayersControl, Polyline, useMap} from 'react-leaflet';
import {appConfig} from '../config.ts';
import {useWorkoutStore} from '../store/workoutStore.ts';
import 'leaflet/dist/leaflet.css';

proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');

const resolutions = [896, 448, 224, 112, 56, 28, 14, 7, 3.5, 1.75, 0.875, 0.4375, 0.21875, 0.109375];

const crs = new L.Proj.CRS(
    'EPSG:27700',
    proj4.defs('EPSG:27700')!,
    {
        resolutions,
        origin: [-238375.0, 1376256.0],
    },
) as unknown as L.CRS;

const OS_TILE_URL = 'https://api.os.uk/maps/raster/v1/zxy/{layer}/{z}/{x}/{y}.png';

function tileUrl(layer: string): string {
    return `${OS_TILE_URL.replace('{layer}', layer)}?key=${appConfig.osMapApiKey}`;
}

const layers = [
    {name: 'Outdoor', id: 'Outdoor_27700'},
    {name: 'Leisure', id: 'Leisure_27700'},
    {name: 'Road', id: 'Road_27700'},
    {name: 'Light', id: 'Light_27700'},
] as const;

const GB_CENTER: [number, number] = [54.5, -2.5];
const DEFAULT_ZOOM = 2;
const LAYER_STORAGE_KEY = 'map-base-layer';
const VIEWPORT_STORAGE_KEY = 'map-viewport';

function savedLayer(): string {
    const saved = localStorage.getItem(LAYER_STORAGE_KEY);
    if (saved && layers.some((l) => l.name === saved)) return saved;
    return layers[0].name;
}

function savedViewport(): {center: [number, number]; zoom: number} | null {
    try {
        const raw = localStorage.getItem(VIEWPORT_STORAGE_KEY);
        if (!raw) return null;
        const {lat, lng, zoom} = JSON.parse(raw);
        if (typeof lat === 'number' && typeof lng === 'number' && typeof zoom === 'number') {
            return {center: [lat, lng], zoom};
        }
    } catch { /* ignore */ }
    return null;
}

function MapPersistence() {
    const map = useMap();
    useEffect(() => {
        const onLayerChange = (e: L.LayersControlEvent) => {
            localStorage.setItem(LAYER_STORAGE_KEY, e.name);
        };
        const onMoveEnd = () => {
            const {lat, lng} = map.getCenter();
            localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify({lat, lng, zoom: map.getZoom()}));
        };
        map.on('baselayerchange', onLayerChange);
        map.on('moveend', onMoveEnd);
        return () => {
            map.off('baselayerchange', onLayerChange);
            map.off('moveend', onMoveEnd);
        };
    }, [map]);
    return null;
}

const TRACK_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#14b8a6'];

function WorkoutTracks() {
    const {workouts, hasMore, loading, loadMore} = useWorkoutStore();

    useEffect(() => {
        loadMore();
    }, [loadMore]);

    useEffect(() => {
        if (!loading && hasMore) {
            loadMore();
        }
    }, [loading, hasMore, loadMore]);

    return (
        <>
            {workouts.map((workout, i) => {
                const points = workout.route_points;
                if (!points || points.length < 2) return null;
                const positions: [number, number][] = points.map((p) => [p.lat, p.lon]);
                return (
                    <Polyline
                        key={workout.id}
                        positions={positions}
                        pathOptions={{color: TRACK_COLORS[i % TRACK_COLORS.length], weight: 3, opacity: 0.8}}
                    />
                );
            })}
        </>
    );
}

export default function MapPage() {
    const [ready, setReady] = useState(false);

    if (!appConfig.osMapApiKey) {
        return (
            <div className="flex h-full items-center justify-center p-8 text-slate-400">
                <p className="text-sm">
                    OS Maps API key not configured. Set <code className="text-slate-300">VITE_OS_MAP_API_KEY</code> in{' '}
                    <code className="text-slate-300">frontend/.env.local</code>.
                </p>
            </div>
        );
    }

    return (
        <div className="relative h-full">
            {!ready && (
                <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-950 text-sm text-slate-500">
                    Loading map...
                </div>
            )}
            <MapContainer
                center={savedViewport()?.center ?? GB_CENTER}
                zoom={savedViewport()?.zoom ?? DEFAULT_ZOOM}
                minZoom={0}
                maxZoom={resolutions.length - 1}
                crs={crs}
                className="h-full w-full"
                whenReady={() => setReady(true)}
            >
                <MapPersistence/>
                <WorkoutTracks/>
                <LayersControl position="topright">
                    {layers.map((layer) => (
                        <LayersControl.BaseLayer key={layer.id} checked={layer.name === savedLayer()} name={layer.name}>
                            <TileLayer
                                url={tileUrl(layer.id)}
                                maxZoom={resolutions.length - 1}
                                attribution="&copy; Ordnance Survey"
                            />
                        </LayersControl.BaseLayer>
                    ))}
                </LayersControl>
            </MapContainer>
        </div>
    );
}
