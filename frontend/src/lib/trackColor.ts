// Shared by the 2D and 3D maps, so a track keeps its colour when the view switches.
const TRACK_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#14b8a6'];

// Keyed off the workout's identity rather than its position in the list: filtering
// changes which tracks are loaded, and picking by index would recolour every
// surviving track each time the viewport or date moved.
export function trackColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return TRACK_COLORS[Math.abs(hash) % TRACK_COLORS.length];
}
