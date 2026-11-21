import { create } from 'zustand';

export interface Located {
  lat: number;
  lng: number;
  // Radius in metres the browser is 95% sure the device is within.
  accuracy: number;
}

interface LocationState {
  // The device's last known position, kept up to date while it is being watched.
  located: Located | null;
  locating: boolean;
  error: string | null;
  /**
   * Asks for the device's position, prompting for permission the first time.
   * Resolves with it, or null when it could not be had (the reason is in
   * `error`). The first success also starts a watch that moves the "you are
   * here" dot as you walk. Kept in a store, not a page, so the dot and the watch
   * stay on when you change tab.
   */
  locate: () => Promise<Located | null>;
  clearError: () => void;
}

// Long enough to get a first GPS fix outdoors. Desktop browsers answer from
// Wi-Fi or the IP address, which takes about a second.
const LOCATE_TIMEOUT_MS = 20_000;
const ERROR_SHOWN_MS = 6_000;

function describe(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location is blocked for this site. Allow it in your browser settings and try again.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location is not available right now.';
    case error.TIMEOUT:
      return 'Finding your location took too long. Try again.';
    default:
      return 'Could not find your location.';
  }
}

function fromPosition(position: GeolocationPosition): Located {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
}

let watchId: number | null = null;
let errorTimer: number | undefined;

export const useLocationStore = create<LocationState>((set) => {
  const fail = (message: string) => {
    window.clearTimeout(errorTimer);
    set({ locating: false, error: message });
    errorTimer = window.setTimeout(() => set({ error: null }), ERROR_SHOWN_MS);
  };

  const stopWatching = () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  };

  // Errors after the first fix are left alone, apart from permission being
  // taken away: a watch reports a timeout or a lost signal every so often, and
  // the dot staying where it last was is the right answer to those.
  const startWatching = () => {
    if (watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      (position) => set({ located: fromPosition(position) }),
      (error) => {
        if (error.code !== error.PERMISSION_DENIED) return;
        stopWatching();
        set({ located: null });
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
  };

  return {
    located: null,
    locating: false,
    error: null,

    clearError: () => set({ error: null }),

    locate: () => {
      // Browsers only give a position to pages served over HTTPS (or localhost),
      // and say nothing useful when they refuse for that reason.
      if (!window.isSecureContext) {
        fail('Your location is only available when the site is served over HTTPS.');
        return Promise.resolve(null);
      }
      if (!('geolocation' in navigator)) {
        fail('This browser cannot share your location.');
        return Promise.resolve(null);
      }

      window.clearTimeout(errorTimer);
      set({ locating: true, error: null });
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const located = fromPosition(position);
            set({ located, locating: false });
            startWatching();
            resolve(located);
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              stopWatching();
              set({ located: null });
            }
            fail(describe(error));
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: LOCATE_TIMEOUT_MS, maximumAge: 30_000 },
        );
      });
    },
  };
});
