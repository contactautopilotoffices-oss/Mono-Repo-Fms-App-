export async function fetchWithRetry(
  url: string | URL | globalThis.Request,
  options?: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('network request failed') || msg.includes('timeout') || msg.includes('network')) {
        if (i === maxRetries - 1) throw err;
        const delay = 1000 * Math.pow(2, i);
        console.warn([fetchWithRetry] Network error on , retrying in ms... (Attempt  of ));
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
