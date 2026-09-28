/**
 * Does Open-Meteo's wave model have data at these coordinates? Shared by stage
 * 3 (every OSM place) and stage 3.5b (surf-forecast's breaks), because a spot
 * the model cannot rate only reads as a broken marker.
 */
import { setTimeout as sleep } from 'node:timers/promises';

let log = line => console.log(line);
export function setMarineLogger(fn) {
  log = fn;
}

export function nextUtcHour() {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
  return d.toISOString().slice(0, 13) + ':00';
}

export async function waveHeights(batch, hour, attempt = 0) {
  const lats = batch.map(s => s.coordinates.lat.toFixed(4)).join(',');
  const lons = batch.map(s => s.coordinates.lon.toFixed(4)).join(',');
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
    `&hourly=wave_height,swell_wave_height,wind_wave_height&timezone=GMT&start_hour=${hour}&end_hour=${hour}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(err => ({ ok: false, status: err.message }));
  if (!res.ok) {
    if (attempt >= 8) throw new Error(`marine API kept failing (${res.status})`);
    const wait = res.status === 429 ? 65_000 : 15_000 * (attempt + 1);
    log(`    ${res.status}, retrying in ${wait / 1000}s`);
    await sleep(wait);
    return waveHeights(batch, hour, attempt + 1);
  }
  const body = await res.json();
  if (body?.error) {
    if (attempt >= 6) throw new Error(body.reason);
    log(`    ${body.reason}, waiting`);
    await sleep(65_000);
    return waveHeights(batch, hour, attempt + 1);
  }
  const list = Array.isArray(body) ? body : [body];
  return list.map(r => {
    const h = r?.hourly;
    if (!h) return false;
    return [h.wave_height, h.swell_wave_height, h.wind_wave_height].some(series => series?.[0] != null);
  });
}
