import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * One interval shared by every subscriber, instead of one per component.
 *
 * List rows that show a live "elapsed" counter each used to create their own
 * setInterval. With ~20 visible rows that is 20 timers firing every second, each
 * triggering its own state update and re-render, forever, even while the user is
 * only scrolling. That continuous churn is a major source of list jank.
 *
 * This module keeps a single interval that only runs while at least one component
 * is subscribed AND the app is foregrounded. Background ticks are pure waste: no
 * one can see the result, and on resume the value is recomputed anyway.
 */

type Listener = (tick: number) => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let tick = 0;
let appStateSub: { remove: () => void } | null = null;

function emit(): void {
  tick += 1;
  // Iterate a copy: a listener may unsubscribe during the loop.
  for (const listener of [...listeners]) listener(tick);
}

function startInterval(): void {
  if (intervalId !== null) return;
  intervalId = setInterval(emit, 1000);
}

function stopInterval(): void {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}

function isForeground(): boolean {
  // Treat anything that is not explicitly backgrounded as visible. RN reports
  // 'unknown' on some platforms before the first AppState event, and comparing
  // against 'active' there would leave the ticker permanently stopped.
  const state = AppState.currentState;
  return state !== 'background' && state !== 'inactive';
}

function syncRunning(): void {
  const shouldRun = listeners.size > 0 && isForeground();
  if (shouldRun) startInterval();
  else stopInterval();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (next) => {
      // On resume, emit once so every subscriber refreshes immediately rather
      // than showing a stale value until the next second boundary.
      if (next === 'active' && listeners.size > 0) emit();
      syncRunning();
    });
  }

  syncRunning();

  return () => {
    listeners.delete(listener);
    syncRunning();
  };
}

/**
 * Re-render once per second while `enabled` is true.
 *
 * Returns a counter that changes on each tick; use it as a dependency for
 * recomputing elapsed time. Pass `enabled: false` for rows that do not need a
 * live timer (for example a closed ticket with a fixed resolved_at) so they never
 * subscribe at all.
 */
export function useSharedTicker(enabled = true): number {
  const [value, setValue] = useState(tick);

  useEffect(() => {
    if (!enabled) return;
    return subscribe(setValue);
  }, [enabled]);

  return enabled ? value : 0;
}

export default useSharedTicker;
