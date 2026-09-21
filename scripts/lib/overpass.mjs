/**
 * Overpass client shared by the catalogue stages, with the retries the public
 * mirrors need: they rate-limit (429), time out (504), and -- worst -- answer a
 * timed-out query with HTTP 200 and partial data.
 */
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Mirrors are tried in turn on failure. When some are down, rotating through
 * them costs a timeout each; OVERPASS_ENDPOINTS (comma-separated) pins the
 * list to the ones that answer.
 */
const ENDPOINTS = process.env.OVERPASS_ENDPOINTS?.split(',').filter(Boolean) ?? [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

const USER_AGENT = 'wave-reader-catalog/1.0 (https://github.com/paularrea/wave-reader)';

let log = line => console.log(line);
/** Route retry messages through the caller's logger. */
export function setOverpassLogger(fn) {
  log = fn;
}

export async function overpass(query, attempt = 0) {
  const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(240_000),
    });
  } catch (err) {
    if (attempt >= 8) throw new Error(`Overpass unreachable: ${err.message}`);
    log(`    ${endpoint.split('/')[2]} failed (${err.message}), retrying`);
    await sleep(10_000);
    return overpass(query, attempt + 1);
  }

  if (res.status === 429 || res.status === 504) {
    if (attempt >= 8) throw new Error(`Overpass kept returning ${res.status}`);
    const wait = 12_000 + attempt * 8_000;
    log(`    ${res.status} from ${endpoint.split('/')[2]}, retrying in ${wait / 1000}s`);
    await sleep(wait);
    return overpass(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 160)}`);

  const body = await res.json();

  /**
   * Overpass answers a timed-out or memory-capped query with HTTP 200, a
   * partial element list and a `remark`. Taking that at face value is how
   * County Donegal went from 15 beaches to 2 between runs -- silent data loss
   * dressed up as success.
   */
  if (typeof body.remark === 'string' && /timed out|out of memory|error/i.test(body.remark)) {
    if (attempt >= 8) throw new Error(`Overpass kept returning partial data: ${body.remark}`);
    const wait = 20_000 + attempt * 10_000;
    log(`    partial result ("${body.remark.slice(0, 60)}"), retrying in ${wait / 1000}s`);
    await sleep(wait);
    return overpass(query, attempt + 1);
  }

  return body;
}
