import { useEffect, useRef, useState } from 'react';
import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl, type ErrorEvent, type GeoJSONSource, type ImageSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { appConfig } from '../config.ts';
import { useAccessToken, getAccessToken } from '../auth/token.ts';
import type { Workout } from '../api/workouts.ts';
import { fieldImage, type ScoreField } from '../lib/scoreField.ts';
import { trackColor } from '../lib/trackColor.ts';
import { useWorkoutStore } from '../store/workoutStore.ts';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre finds its worker relative to its own module by default, which is not
// where Vite leaves it after pre-bundling or a build. Importing it as a `?url`
// asset is what gets the file copied and gives us an address that resolves.
setWorkerUrl(workerUrl);

/**
 * A raster base layer as the 3D view drapes it over the terrain. Always Web
 * Mercator: MapLibre has no other projection, which is why this view exists
 * alongside the Leaflet one rather than replacing it.
 */
export interface DrapedLayer {
  // {z}/{x}/{y} template, absolute or relative to the page.
  url: string;
  tileSize: number;
  // The tile zoom range the server actually has. MapLibre overzooms past
  // `maxzoom` rather than requesting tiles that would fail.
  minzoom?: number;
  maxzoom: number;
  // [west, south, east, north]. Keeps the map from asking a regional source for
  // tiles it does not have.
  bounds?: [number, number, number, number];
}

// AWS Open Data's copy of the Mapzen elevation tiles: global, free, and needing no
// key. Terrarium encodes height as (R * 256 + G + B / 256) - 32768 metres.
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TERRAIN_MAX_ZOOM = 15;
const TERRAIN_ATTRIBUTION =
  'Terrain: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Mapzen and others</a>';
// British hills are modest next to the view distances this gives, and at 1:1 they
// read flatter than they feel on foot.
const TERRAIN_EXAGGERATION = 1.5;

// Leaflet numbers its zoom levels for 256px tiles and MapLibre for 512px ones, so
// the same view is one level lower here. The page keeps viewports in Leaflet's
// numbering, and this converts at the edges.
const LEAFLET_ZOOM_OFFSET = 1;
const INITIAL_PITCH = 60;
// The default of 60 cannot look along a valley. Beyond it MapLibre calls the
// rendering experimental, but terrain views are where it is wanted.
const MAX_PITCH = 85;

const BOUNDS_DEBOUNCE_MS = 400;

const BASE_SOURCE = 'base';
const BASE_LAYER = 'base';
const HILLSHADE_LAYER = 'hillshade';
const TRACKS_SOURCE = 'tracks';
const ENDS_SOURCE = 'track-ends';
const SCRUB_SOURCE = 'scrub';
const PICK_SOURCE = 'pick';
const FIELD_SOURCE = 'score-field';
const FIELD_LAYER = 'score-field';
const TRACK_CASING = 'track-casing';
const TRACK_LINE = 'track-line';
const TRACK_HIT = 'track-hit';

// Mirrors the 2D map's track styling: a white casing under every line, the
// selected track drawn wider and on top, and the rest dimmed while one is chosen.
const LINE_WIDTH = 3;
const SELECTED_LINE_WIDTH = 5;
const CASING_EXTRA_WIDTH = 3;
const HIT_WIDTH = 14;

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

// The page's API base is usually same-origin and relative (`/api`). MapLibre needs
// absolute tile URLs, and the token check below needs a prefix to match against.
function absolute(url: string): string {
  return url.startsWith('/') ? `${window.location.origin}${url}` : url;
}

function rasterSource(layer: DrapedLayer) {
  return {
    type: 'raster' as const,
    tiles: [absolute(layer.url)],
    tileSize: layer.tileSize,
    minzoom: layer.minzoom ?? 0,
    maxzoom: layer.maxzoom,
    ...(layer.bounds ? { bounds: layer.bounds } : {}),
  };
}

function demSource() {
  return {
    type: 'raster-dem' as const,
    tiles: [TERRAIN_TILES],
    encoding: 'terrarium' as const,
    tileSize: 256,
    maxzoom: TERRAIN_MAX_ZOOM,
    attribution: TERRAIN_ATTRIBUTION,
  };
}

function drawable(workouts: Workout[]): Workout[] {
  return workouts.filter((workout) => (workout.route_points?.length ?? 0) >= 2);
}

function trackFeatures(workouts: Workout[], selectedId: string | null): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: drawable(workouts).map((workout) => ({
      type: 'Feature',
      properties: {
        id: workout.id,
        color: trackColor(workout.id),
        selected: workout.id === selectedId,
        dimmed: selectedId !== null && workout.id !== selectedId,
      },
      geometry: {
        type: 'LineString',
        coordinates: workout.route_points.map((p) => [p.lon, p.lat]),
      },
    })),
  };
}

function point(lon: number, lat: number, properties: Record<string, unknown> = {}): Feature<Point> {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } };
}

function endFeatures(workout: Workout | undefined): FeatureCollection<Point> {
  if (!workout || workout.route_points.length < 2) return { type: 'FeatureCollection', features: [] };
  const first = workout.route_points[0];
  const last = workout.route_points[workout.route_points.length - 1];
  return {
    type: 'FeatureCollection',
    features: [point(first.lon, first.lat, { end: 'start' }), point(last.lon, last.lat, { end: 'finish' })],
  };
}

interface TerrainMapProps {
  base: DrapedLayer;
  // Centre and zoom to open on, zoom in Leaflet's numbering. Read once, at mount.
  lat: number;
  lng: number;
  zoom: number;
  // Leaflet-numbered, like `zoom`.
  maxZoom: number;
  // Whether the workout tracks are drawn.
  tracks: boolean;
  // Given together to make the map clickable, as on the 2D map: each click reports
  // where it landed, and the last point chosen stays marked.
  picked?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  // Scores to colour the ground with, draped over the terrain like the base layer.
  field?: ScoreField | null;
  fieldOpacity?: number;
  onMove: (lat: number, lng: number, zoom: number) => void;
  onReady: () => void;
  onTileError: () => void;
}

/**
 * The 3D view: the workout tracks over the base layer, draped on real terrain
 * that can be tilted and rotated. MapLibre, where the 2D view is Leaflet, as
 * Leaflet only ever draws a flat map.
 */
export default function TerrainMap({
  base,
  lat,
  lng,
  zoom,
  maxZoom,
  tracks,
  picked = null,
  onPick,
  field = null,
  fieldOpacity = 1,
  onMove,
  onReady,
  onTileError,
}: TerrainMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // Field by field, as in the 2D map, so scrubbing the profile wakes only the
  // effect that moves the marker.
  const workouts = useWorkoutStore((state) => state.workouts);
  const selectedWorkoutId = useWorkoutStore((state) => state.selectedWorkoutId);
  const scrubbedPointIndex = useWorkoutStore((state) => state.scrubbedPointIndex);
  const setBounds = useWorkoutStore((state) => state.setBounds);
  const accessToken = useAccessToken();

  // The map is built once, so its listeners reach the latest props through here
  // rather than closing over the ones from the first render.
  const latest = useRef({ base, onPick, onMove, onReady, onTileError });
  useEffect(() => {
    latest.current = { base, onPick, onMove, onReady, onTileError };
  });

  // Set when a base tile fails, so the token renewal that may follow knows there
  // is something to re-request.
  const baseErrored = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const apiBase = absolute(appConfig.apiBase);

    const instance = new MapLibreMap({
      container,
      center: [lng, lat],
      zoom: zoom - LEAFLET_ZOOM_OFFSET,
      maxZoom: maxZoom - LEAFLET_ZOOM_OFFSET,
      pitch: INITIAL_PITCH,
      maxPitch: MAX_PITCH,
      attributionControl: false,
      // Our own tile endpoint wants the access token, which has to go in the URL
      // as it does for Leaflet. Read per request rather than baked into the
      // source, so a renewed token is picked up without rebuilding the layer.
      transformRequest: (url, resourceType) => {
        const token = getAccessToken();
        if (resourceType !== 'Tile' || !token || !url.startsWith(apiBase)) return { url };
        const separator = url.includes('?') ? '&' : '?';
        return { url: `${url}${separator}access_token=${encodeURIComponent(token)}` };
      },
      style: {
        version: 8,
        sources: {
          [BASE_SOURCE]: rasterSource(latest.current.base),
          // Separate sources for the terrain mesh and the shading, as MapLibre
          // recommends: one source serving both is drawn at a lower quality. The
          // tiles are the same, so the second set comes out of the browser cache.
          terrain: demSource(),
          hillshade: demSource(),
          [TRACKS_SOURCE]: { type: 'geojson', data: EMPTY },
          [ENDS_SOURCE]: { type: 'geojson', data: EMPTY },
          [SCRUB_SOURCE]: { type: 'geojson', data: EMPTY },
          [PICK_SOURCE]: { type: 'geojson', data: EMPTY },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#020617' } },
          { id: BASE_LAYER, type: 'raster', source: BASE_SOURCE },
          // Terrain gives the shape but no lighting, so imagery draped over it
          // still looks evenly lit. A light hillshade on top brings the relief out.
          {
            id: HILLSHADE_LAYER,
            type: 'hillshade',
            source: 'hillshade',
            paint: {
              'hillshade-exaggeration': 0.35,
              'hillshade-shadow-color': 'rgba(0, 0, 0, 0.35)',
              'hillshade-highlight-color': 'rgba(255, 255, 255, 0.15)',
              'hillshade-accent-color': 'rgba(0, 0, 0, 0.15)',
            },
          },
          // Every casing sits under every line, as the 2D map's casing pane does.
          {
            id: TRACK_CASING,
            type: 'line',
            source: TRACKS_SOURCE,
            layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', ['get', 'selected'], 1, 0] },
            paint: {
              'line-color': '#ffffff',
              'line-width': [
                'case',
                ['get', 'selected'],
                SELECTED_LINE_WIDTH + CASING_EXTRA_WIDTH,
                LINE_WIDTH + CASING_EXTRA_WIDTH,
              ],
              'line-opacity': ['case', ['get', 'dimmed'], 0.25, 0.9],
            },
          },
          {
            id: TRACK_LINE,
            type: 'line',
            source: TRACKS_SOURCE,
            layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', ['get', 'selected'], 1, 0] },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['case', ['get', 'selected'], SELECTED_LINE_WIDTH, LINE_WIDTH],
              'line-opacity': ['case', ['get', 'dimmed'], 0.3, ['get', 'selected'], 1, 0.8],
            },
          },
          // A wide invisible line to click, since a 3px one is fiddly to hit.
          // Opacity does not stop a feature being queried.
          {
            id: TRACK_HIT,
            type: 'line',
            source: TRACKS_SOURCE,
            paint: { 'line-width': HIT_WIDTH, 'line-opacity': 0 },
          },
          {
            id: 'track-ends',
            type: 'circle',
            source: ENDS_SOURCE,
            paint: {
              'circle-radius': 6,
              'circle-color': ['match', ['get', 'end'], 'start', '#22c55e', '#ef4444'],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            },
          },
          {
            id: 'scrub',
            type: 'circle',
            source: SCRUB_SOURCE,
            paint: {
              'circle-radius': 6,
              'circle-color': '#38bdf8',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3,
            },
          },
          {
            id: 'pick',
            type: 'circle',
            source: PICK_SOURCE,
            paint: {
              'circle-radius': 7,
              'circle-color': '#f97316',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3,
            },
          },
        ],
        terrain: { source: 'terrain', exaggeration: TERRAIN_EXAGGERATION },
        sky: {
          'sky-color': '#7fb4e6',
          'horizon-color': '#dbe7f2',
          'fog-color': '#dbe7f2',
          // Keeps the haze out towards the horizon, where it gives distant ridges
          // depth, rather than over the ground being looked at.
          'fog-ground-blend': 0.8,
        },
      },
    });

    // Bottom-right, as the 2D map's zoom control is: the other corners are taken
    // by the filter bar, layer picker and loading indicator.
    instance.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
    instance.addControl(new AttributionControl({ compact: true }), 'bottom-left');

    // MapLibre's bounds are always WGS84, so they go to the search as they are.
    // Tilted towards the horizon they take in a lot of ground; the store holds
    // them to real coordinates.
    const publishBounds = () => {
      const bounds = instance.getBounds();
      setBounds({
        min_lat: bounds.getSouth(),
        max_lat: bounds.getNorth(),
        min_lon: bounds.getWest(),
        max_lon: bounds.getEast(),
      });
    };

    let timer: number | undefined;
    instance.on('moveend', () => {
      const center = instance.getCenter();
      latest.current.onMove(center.lat, center.lng, instance.getZoom() + LEAFLET_ZOOM_OFFSET);
      window.clearTimeout(timer);
      timer = window.setTimeout(publishBounds, BOUNDS_DEBOUNCE_MS);
    });

    instance.on('load', () => {
      publishBounds();
      setMap(instance);
      latest.current.onReady();
    });

    // Tile failures arrive as map errors tagged with their source. Only the base
    // layer's matter here; the terrain is public and needs no token.
    instance.on('error', (event: ErrorEvent & { sourceId?: string }) => {
      if (event.sourceId !== BASE_SOURCE) return;
      baseErrored.current = true;
      latest.current.onTileError();
    });

    // On a clickable map the click is the pick. Otherwise clicking a track
    // selects it, and clicking anywhere else clears the selection.
    instance.on('click', (event) => {
      if (latest.current.onPick) {
        const { lat: pickedLat, lng: pickedLng } = event.lngLat.wrap();
        latest.current.onPick(pickedLat, pickedLng);
        return;
      }
      const [hit] = instance.queryRenderedFeatures(event.point, { layers: [TRACK_HIT] });
      useWorkoutStore.getState().selectWorkout(hit ? String(hit.properties.id) : null);
    });
    instance.on('mouseenter', TRACK_HIT, () => {
      instance.getCanvas().style.cursor = 'pointer';
    });
    instance.on('mouseleave', TRACK_HIT, () => {
      instance.getCanvas().style.cursor = '';
    });

    return () => {
      window.clearTimeout(timer);
      setMap(null);
      instance.remove();
    };
    // Built once per mount: the page remounts this to change the starting view.
  }, []);

  // A new base layer can differ in tile size and zoom range as well as URL, so
  // the source is replaced outright, beneath the hillshade where it started.
  useEffect(() => {
    if (!map) return;
    const tiles = absolute(base.url);
    const current = map.getStyle().sources[BASE_SOURCE];
    if (current && 'tiles' in current && current.tiles?.[0] === tiles) return;

    map.removeLayer(BASE_LAYER);
    map.removeSource(BASE_SOURCE);
    map.addSource(BASE_SOURCE, rasterSource(base));
    map.addLayer({ id: BASE_LAYER, type: 'raster', source: BASE_SOURCE }, HILLSHADE_LAYER);
    baseErrored.current = false;
  }, [map, base]);

  // A renewal after failed tiles is the retry, as it is in the 2D map: the
  // request transform picks up the new token, and this re-requests the tiles.
  useEffect(() => {
    if (!map || !accessToken || !baseErrored.current) return;
    baseErrored.current = false;
    map.refreshTiles(BASE_SOURCE);
  }, [map, accessToken]);

  useEffect(() => {
    if (!map) return;
    const selected = tracks ? workouts.find((workout) => workout.id === selectedWorkoutId) : undefined;
    map.getSource<GeoJSONSource>(TRACKS_SOURCE)?.setData(tracks ? trackFeatures(workouts, selectedWorkoutId) : EMPTY);
    map.getSource<GeoJSONSource>(ENDS_SOURCE)?.setData(endFeatures(selected));
  }, [map, tracks, workouts, selectedWorkoutId]);

  useEffect(() => {
    if (!map) return;
    map
      .getSource<GeoJSONSource>(PICK_SOURCE)
      ?.setData(picked ? { type: 'FeatureCollection', features: [point(picked.lng, picked.lat)] } : EMPTY);
  }, [map, picked]);

  // Over the base layer and its shading, under the tracks and markers. The image
  // is swapped in place when the scores change, as a new one arrives on every pan.
  useEffect(() => {
    if (!map) return;
    if (!field) {
      if (map.getLayer(FIELD_LAYER)) map.removeLayer(FIELD_LAYER);
      if (map.getSource(FIELD_SOURCE)) map.removeSource(FIELD_SOURCE);
      return;
    }
    const image = fieldImage(field);
    const source = map.getSource<ImageSource>(FIELD_SOURCE);
    if (source) {
      source.updateImage(image);
      return;
    }
    map.addSource(FIELD_SOURCE, { type: 'image', ...image });
    map.addLayer(
      {
        id: FIELD_LAYER,
        type: 'raster',
        source: FIELD_SOURCE,
        // No cross-fade: it would show the old scores through the new ones.
        paint: { 'raster-opacity': fieldOpacity, 'raster-fade-duration': 0 },
      },
      TRACK_CASING,
    );
  }, [map, field, fieldOpacity]);

  // A crosshair while the map is clickable, as on the 2D map.
  const pickable = onPick !== undefined;
  useEffect(() => {
    if (!map || !pickable) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';
    return () => {
      canvas.style.cursor = '';
    };
  }, [map, pickable]);

  useEffect(() => {
    if (!map) return;
    const selected = workouts.find((workout) => workout.id === selectedWorkoutId);
    // A reload while the pointer is down replaces the workout, and the profile's
    // index can briefly outrun the track it came from.
    const scrubbed = scrubbedPointIndex === null ? undefined : selected?.route_points[scrubbedPointIndex];
    map
      .getSource<GeoJSONSource>(SCRUB_SOURCE)
      ?.setData(scrubbed ? { type: 'FeatureCollection', features: [point(scrubbed.lon, scrubbed.lat)] } : EMPTY);
  }, [map, workouts, selectedWorkoutId, scrubbedPointIndex]);

  return <div ref={containerRef} className="h-full w-full"/>;
}
