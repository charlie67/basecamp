import { getAccessToken } from '../auth/token.ts';
import { appConfig } from '../config.ts';

export type SunsetLabel = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Dull';

// The parts a score is made from, each 0–1. One is null when the model had
// nothing to score it from, which is not the same as scoring it badly.
export interface SunsetFactors {
  canvas: number | null;
  local_low: number | null;
  horizon: number | null;
  clarity: number | null;
  rain: number | null;
}

export type SunsetFactor = keyof SunsetFactors;

// One weather model's score for one sunset, with the weather behind it.
export interface SunsetDay {
  // The local day, yyyy-mm-dd. This is what lines the same sunset up across
  // models, as each places the sunset itself a few seconds differently.
  date: string;
  // Unix seconds.
  sunset: number;
  // Compass bearing of the setting sun, degrees from north.
  azimuth: number;
  // 0–10.
  score: number;
  label: SunsetLabel;
  factors: SunsetFactors;
  // Added for a clearing storm, already included in `score`.
  bonus: number;
  // What held the score back, in words. Empty when nothing did.
  reasons: string[];
  // Cloud cover percentages overhead at sunset.
  high: number | null;
  mid: number | null;
  low: number | null;
  // Light-blocking cloud (%) at each of the forecast's path_points_km toward the sun.
  path_blocks: (number | null)[];
  humidity: number | null;
  visibility_km: number | null;
  aerosol: number | null;
  // mm/h at sunset.
  rain: number | null;
  // hPa over the 6 hours before sunset.
  pressure_change: number | null;
}

export interface SunsetModelForecast {
  // Open-Meteo's name for the weather model.
  model: string;
  // A day is missing when the model had no sunset or no weather for it.
  days: SunsetDay[];
}

export interface SunsetForecast {
  // Centre of the grid cell the forecast is for: close to the point asked about,
  // but not exactly it.
  lat: number;
  lon: number;
  // The cell's own offset from UTC, for showing sunset times as its clocks will.
  utc_offset_seconds: number;
  // When the backend fetched the weather behind the scores. It caches by grid
  // cell, so this can be up to an hour ago.
  fetched_at: string;
  path_points_km: number[];
  // One per weather model, in the order the backend is configured with.
  models: SunsetModelForecast[];
}

/**
 * How good the next few sunsets at a point are likely to be, scored separately
 * against each weather model the backend is configured with.
 */
export async function fetchSunsetForecast(lat: number, lon: number, signal?: AbortSignal): Promise<SunsetForecast> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const token = getAccessToken();
  const response = await fetch(`${appConfig.apiBase}/sunset?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (response.status === 401) {
    throw new Error('Your session expired — reload the page to sign in again.');
  }
  if (response.status === 502) {
    throw new Error('The weather forecast is unavailable right now.');
  }
  if (!response.ok) {
    throw new Error(`Failed to load sunset forecast (${response.status})`);
  }

  return response.json();
}
