#!/usr/bin/env node
/**
 * Stage 3 of the catalogue: drop spots the wave model has no data for.
 *
 * Open-Meteo snaps each coordinate to its nearest sea cell, which covers most
 * of the coast, but a spot deep in an estuary or a lagoon can still come back
 * with no wave height at all. Such a spot can never be rated, and an unrated
 * marker only reads as a broken map, so it is removed from the catalogue and
 * recorded with its reason.
 *
 *   node scripts/filter-spots-with-data.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const OUT_PATH = new URL('../src/data/spots.json', import.meta.url);
const INDEX_PATH = new URL('../src/data/spots.index.json', import.meta.url);
const REPORT_PATH = new URL('../src/data/spots.catalog-report.json', import.meta.url);

const BATCH = 50;
/**
 * Open-Meteo weights a multi-location request as several calls, so 50
 * coordinates at a 1 s pace hit its limit partway through a national run.
 */
const PAUSE_MS = 4000;
const PROGRESS_PATH = new URL('../.cache/filter-progress.json', import.meta.url);
const LOG_PATH = process.env.CATALOG_LOG;

function log(line) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(stamped);
  if (LOG_PATH) appendFileSync(LOG_PATH, stamped + '\n');
}

function nextUtcHour() {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
  return d.toISOString().slice(0, 13) + ':00';
}

async function waveHeights(batch, hour, attempt = 0) {
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

async function main() {
  const spots = JSON.parse(await readFile(OUT_PATH, 'utf8'));
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  const hour = nextUtcHour();

  // Resumable: a rate-limited run keeps what it already checked.
  let progress = { checked: {} };
  try {
    progress = JSON.parse(await readFile(PROGRESS_PATH, 'utf8'));
  } catch {
    // fresh run
  }
  await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });

  const todo = spots.filter(s => !(s.id in progress.checked));
  log(`Checking wave model data: ${todo.length} to check, ${spots.length - todo.length} already checked`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const hasData = await waveHeights(batch, hour);
    batch.forEach((spot, j) => (progress.checked[spot.id] = hasData[j]));
    await writeFile(PROGRESS_PATH, JSON.stringify(progress));
    if (i % 1000 === 0) log(`  ${i}/${todo.length} checked this run`);
    await sleep(PAUSE_MS);
  }

  const kept = spots.filter(s => progress.checked[s.id] !== false);
  const dropped = spots
    .filter(s => progress.checked[s.id] === false)
    .map(spot => ({
      name: spot.name,
      community: spot.community,
      country: spot.country,
      osmId: spot.provenance?.osmId,
      reason: 'no wave model data at these coordinates',
    }));

  await writeFile(OUT_PATH, JSON.stringify(kept, null, 1) + '\n');
  await writeFile(
    INDEX_PATH,
    JSON.stringify(
      kept.map(s => ({ id: s.id, name: s.name, community: s.community, country: s.country, type: s.type, coordinates: s.coordinates }))
    ) + '\n'
  );
  const others = (report.dropped ?? []).filter(d => d.reason !== 'no wave model data at these coordinates');
  await writeFile(
    REPORT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), kept: kept.length, dropped: [...others, ...dropped] }, null, 1) + '\n'
  );

  const byCountry = {};
  dropped.forEach(d => (byCountry[d.country] = (byCountry[d.country] ?? 0) + 1));
  log(`DONE. Kept ${kept.length}, dropped ${dropped.length} without wave data ${JSON.stringify(byCountry)}`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
