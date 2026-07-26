import { useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { useWorkoutStore } from '../store/workoutStore.ts';

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function WorkoutsPage() {
  const { workouts, totalElements, hasMore, loading, error, loadMore } =
    useWorkoutStore();
  const auth = useAuth();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Initial load.
  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // Load the next page whenever the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Workouts</h1>
          <div className="flex items-center gap-4">
            {totalElements > 0 && (
              <span className="text-sm text-slate-400">{totalElements} total</span>
            )}
            {/* Full RP-initiated logout: this ends the Authentik SSO session as
                well as the local one, so signing back in needs real credentials.
                `signoutRedirect` clears the stored user on its way out. */}
            <button
              type="button"
              onClick={() => void auth.signoutRedirect()}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
            >
              Sign out
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && workouts.length === 0 && (
          <p className="text-sm text-slate-400">No workouts stored yet.</p>
        )}

        <ul className="space-y-3">
          {workouts.map((workout) => (
            <li
              key={workout.id}
              className="rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm"
            >
              <div className="font-medium">{workout.type ?? 'Unknown type'}</div>
              <div className="mt-1 text-sm text-slate-400">
                {formatTime(workout.start_date)} → {formatTime(workout.end_date)}
              </div>
            </li>
          ))}
        </ul>

        {/* Sentinel: when it enters the viewport, the next page loads. */}
        {hasMore && <div ref={sentinelRef} className="h-10" />}

        {loading && (
          <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
        )}

        {!hasMore && workouts.length > 0 && (
          <p className="py-4 text-center text-sm text-slate-600">
            You've reached the end.
          </p>
        )}
      </div>
    </div>
  );
}
