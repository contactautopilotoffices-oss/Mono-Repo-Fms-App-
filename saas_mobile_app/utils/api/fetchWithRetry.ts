import { showNetworkErrorToast, showSlowNetworkToast } from '@/utils/networkToast';

/**
 * Per-attempt timeout.
 *
 * Was 12s with 3 attempts and 1s/2s backoff, so a single call could block for
 * ~39s before throwing, and React Query's own `retry` stacked on top of that.
 * 8s is well past the p99 for a healthy request and fails fast when the network
 * is actually bad.
 */
const DEFAULT_TIMEOUT_MS = 8000;

/** Attempts for idempotent reads. */
const DEFAULT_MAX_RETRIES = 2;

/** Show the "slow network" hint before aborting, not at the same moment. */
const SLOW_NETWORK_HINT_MS = 4000;

export interface FetchRetryOptions {
  /**
   * Total attempts. Pass 1 for non-idempotent requests (inserts, updates): a
   * write that times out may already have landed server-side, so replaying it
   * risks duplicate rows and double state transitions.
   */
  maxRetries?: number;
  /** Per-attempt timeout in ms. */
  timeoutMs?: number;
  /** Suppress the user-facing network toasts (for background prefetches). */
  silent?: boolean;
}

export async function fetchWithRetry(
  url: string | URL | globalThis.Request,
  options?: RequestInit,
  retryOptions: number | FetchRetryOptions = {}
): Promise<Response> {
  // Back-compat: callers used to pass `maxRetries` as a bare third argument.
  const opts: FetchRetryOptions =
    typeof retryOptions === 'number' ? { maxRetries: retryOptions } : retryOptions;

  const maxRetries = Math.max(1, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const silent = opts.silent ?? false;

  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    const controller = new AbortController();

    // Hint at a slow connection *before* we give up, so the user gets feedback
    // while the request may still succeed.
    const slowTimer = silent
      ? null
      : setTimeout(() => {
          showSlowNetworkToast();
        }, SLOW_NETWORK_HINT_MS);

    const abortTimer = setTimeout(() => controller.abort(), timeoutMs);

    const mergedOptions: RequestInit = {
      ...options,
      signal: options?.signal || controller.signal,
    };

    try {
      const response = await fetch(url, mergedOptions);
      if (slowTimer) clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      return response;
    } catch (err: any) {
      if (slowTimer) clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      lastError = err;

      // A caller-supplied signal aborting is an intentional cancellation
      // (screen unmounted, query superseded). Never retry or toast those.
      if (options?.signal?.aborted) throw err;

      const msg = (err?.message || '').toLowerCase();
      const isAbort = err?.name === 'AbortError' || msg.includes('aborted');
      const isNetwork =
        msg.includes('network request failed') ||
        msg.includes('timeout') ||
        msg.includes('network') ||
        isAbort;

      if (!isNetwork) throw err;

      if (i === maxRetries - 1) {
        if (!silent) {
          showNetworkErrorToast('Network connection is slow or offline. Please check your connection.');
        }
        throw err;
      }

      // Short linear backoff. Exponential backoff on top of a long timeout is
      // what turned a bad connection into a half-minute freeze.
      const delay = 500 * (i + 1);
      console.warn(
        `[fetchWithRetry] Network error on ${url}, retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})`
      );
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  if (!silent) showNetworkErrorToast();
  throw lastError;
}
