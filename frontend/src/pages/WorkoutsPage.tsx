import { useEffect, useRef } from 'react';
import { useWorkoutStore } from '../store/workoutStore.ts';
import { formatDateTime } from '../lib/format.ts';
import WorkoutFilterBar from '../components/WorkoutFilterBar.tsx';

export default function WorkoutsPage() {
  const { workouts, totalElements, hasMore, loading, error, loadMore, generation, setScope } =
    useWorkoutStore();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The list shows every workout matching the date, wherever it happened — the
  // map's viewport bounds do not apply here.
  useEffect(() => {
    setScope('list');
  }, [setScope]);

  // Initial load, and a fresh first page whenever the filter changes.
  useEffect(() => {
    loadMore();
  }, [loadMore, generation]);

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
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Workouts</h1>
        {totalElements > 0 && (
          <span className="text-sm text-slate-400">{totalElements} total</span>
        )}
      </header>

        <WorkoutFilterBar/>

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
                {formatDateTime(workout.start_date)} → {formatDateTime(workout.end_date)}
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
  );
}
