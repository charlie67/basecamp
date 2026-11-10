import {useCallback, useEffect, useState} from 'react';
import {MapView, type PickedPoint} from './MapPage.tsx';
import SunsetPanel, {type SunsetStatus} from '../components/SunsetPanel.tsx';
import {fetchSunsetForecast} from '../api/sunset.ts';

function Hint() {
    return (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-300 shadow-lg backdrop-blur">
            Click the map to forecast the sunset there
        </div>
    );
}

/**
 * The map without the workouts: click anywhere on it for how good the next few
 * sunsets there are likely to be.
 */
export default function SunsetPage() {
    const [picked, setPicked] = useState<PickedPoint | null>(null);
    const [status, setStatus] = useState<SunsetStatus>({state: 'loading'});

    const onPick = useCallback((lat: number, lng: number) => {
        // Set here rather than in the effect, so a second click never shows the
        // previous point's forecast under the new point's coordinates.
        setStatus({state: 'loading'});
        setPicked({lat, lng});
    }, []);

    useEffect(() => {
        if (!picked) return;

        const controller = new AbortController();
        fetchSunsetForecast(picked.lat, picked.lng, controller.signal)
            .then((forecast) => setStatus({state: 'done', forecast}))
            .catch((error: unknown) => {
                // Aborted by a newer click, whose own request will report instead.
                if (controller.signal.aborted) return;
                setStatus({state: 'error', message: error instanceof Error ? error.message : 'Forecast failed'});
            });
        return () => controller.abort();
    }, [picked]);

    return (
        <MapView tracks={false} picked={picked} onPick={onPick}>
            {picked ? (
                <SunsetPanel
                    // Keyed by the point, so each new one opens on its first score.
                    key={`${picked.lat},${picked.lng}`}
                    lat={picked.lat}
                    lng={picked.lng}
                    status={status}
                    onClose={() => setPicked(null)}
                />
            ) : (
                <Hint/>
            )}
        </MapView>
    );
}
