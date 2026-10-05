import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * Use this for anything that drives a network request from a text input. Feeding
 * raw input state straight into a query key (or into a manual refetch) fires one
 * request per keystroke, so typing a six-letter search term meant six round
 * trips, five of which were thrown away.
 *
 * Keep rendering the raw value in the TextInput so typing stays instant; only
 * the fetch is debounced.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // Apply an empty value immediately: clearing a search should feel instant
    // rather than waiting out the delay.
    if (typeof value === 'string' && value === '') {
      setDebounced(value);
      return;
    }

    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
