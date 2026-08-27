import { showNetworkErrorToast, showSlowNetworkToast } from '@/utils/networkToast';

const DEFAULT_TIMEOUT_MS = 12000;

export async function fetchWithRetry(
  url: string | URL | globalThis.Request,
  options?: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    // Setup timeout controller
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // If taking too long, show slow network toast
      showSlowNetworkToast();
      controller.abort();
    }, DEFAULT_TIMEOUT_MS);

    const mergedOptions: RequestInit = {
      ...options,
      signal: options?.signal || controller.signal,
    };

    try {
      const response = await fetch(url, mergedOptions);
      clearTimeout(timer);
      return response;
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      const msg = (err?.message || '').toLowerCase();
      const isAbort = err?.name === 'AbortError' || msg.includes('aborted');
      const isNetwork = msg.includes('network request failed') || msg.includes('timeout') || msg.includes('network') || isAbort;

      if (isNetwork) {
        if (i === maxRetries - 1) {
          showNetworkErrorToast('Network connection is slow or offline. Please check your connection.');
          throw err;
        }
        const delay = 1000 * Math.pow(2, i);
        console.warn(`[fetchWithRetry] Network error on ${url}, retrying in ${delay}ms... (Attempt ${i + 1} of ${maxRetries})`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }

  showNetworkErrorToast();
  throw lastError;
}
