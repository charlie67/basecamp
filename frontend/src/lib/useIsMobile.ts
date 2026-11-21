import { useSyncExternalStore } from 'react';

// Tailwind's `md` breakpoint is 48rem. Below it the pages switch to the phone
// layout, so the hook and the `md:` classes must agree on where the line is.
const QUERY = '(max-width: 767.98px)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function snapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/**
 * Whether the window is phone-sized. For behaviour that differs between the two
 * layouts, not just styling: CSS alone can hide a panel, but it cannot stop it
 * fetching or decide what a tap on the map should open.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
