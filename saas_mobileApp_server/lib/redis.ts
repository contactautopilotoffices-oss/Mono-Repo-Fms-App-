import { Redis } from '@upstash/redis';

// Use environment variables for the Upstash Redis REST URL and Token.
// Make sure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set in your environment or Vercel.

const url = process.env.UPSTASH_REDIS_REST_URL || '';
const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';

/**
 * Whether Redis is actually configured.
 *
 * Without this, an unconfigured deployment still issues a doomed HTTP request on
 * every getCache/setCache call and swallows the error, so "caching" made each
 * request slower rather than faster. Callers check this and skip the round trip.
 */
export const isRedisConfigured = url.length > 0 && token.length > 0;

export const redis = new Redis({ url, token });
