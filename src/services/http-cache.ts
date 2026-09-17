/**
 * CDN caching for forecast routes. Serving a repeat request from Vercel's edge
 * costs no function run and, more importantly, no Open-Meteo quota, which the
 * free tier limits per minute.
 *
 * With no `maxSeconds`, the cache lasts until the next whole UTC hour: routes
 * whose index 0 is "the next hour" become wrong the moment that hour arrives.
 */
export function edgeCacheHeaders(maxSeconds?: number, now: Date = new Date()): Record<string, string> {
  const toNextHour = 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds());
  const seconds = Math.max(30, maxSeconds ?? toNextHour);
  return { 'Cache-Control': `public, max-age=0, s-maxage=${seconds}` };
}
