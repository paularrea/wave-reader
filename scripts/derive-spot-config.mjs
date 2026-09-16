#!/usr/bin/env node
/**
 * Stage 2 of the national catalogue: work out which OSM beaches actually face
 * open ocean, which way they face, and the surf config that follows.
 *
 * Method: probe elevation along 16 compass bearings at three distances. A
 * bearing counts as open water when every sample along it is at or below sea
 * level. A beach needs a contiguous arc of open water to be surfable -- a cove
 * inside a ría has water in front of it but no swell window, and this is what
 * separates the two without anyone judging spots by hand.
 *
 *   node scripts/derive-spot-config.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const IN_PATH = new URL('../src/data/osm-beaches.raw.json', import.meta.url);
const OUT_PATH = new URL('../src/data/spots.json', import.meta.url);
const REPORT_PATH = new URL('../src/data/spots.catalog-report.json', import.meta.url);

const BEARINGS = 12;                   // 30 degrees apart
/**
 * One distance, not three.
 *
 * The elevation endpoint caps a request at 100 coordinates and Open-Meteo
 * enforces per-minute and per-hour limits, so probe points are the budget. A
 * single sample 6 km out already separates open ocean from the head of a ría:
 * at 12 bearings a narrow inlet leaves at most one or two bearings clear, well
 * under the contiguous arc a surfable spot needs. Dropping from 48 probes per
 * beach to 12 cut the run from 2,435 requests to about 600.
 */
const PROBE_KM = [6];
const MIN_OPEN_ARC = 3;                // >= 90 degrees of open water
const SEA_LEVEL_M = 0;
const BATCH_BEACHES = 8;               // 96 coords per request, under the 100 cap
const REQUEST_PAUSE_MS = 1200;         // stays clear of the minutely limit

const KM_PER_DEG_LAT = 110.574;

const LOG_PATH = process.env.CATALOG_LOG;

/** Unbuffered, so a long run can be watched while it happens. */
function log(line) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(stamped);
  if (LOG_PATH) appendFileSync(LOG_PATH, stamped + '\n');
}

function destination(lat, lon, bearingDeg, km) {
  const dLat = km / KM_PER_DEG_LAT;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    lat: lat + dLat * Math.cos(rad),
    lon: lon + dLon * Math.sin(rad),
  };
}

/** Every probe point for one beach, ordered bearing-major. */
function probePoints(beach) {
  const points = [];
  for (let b = 0; b < BEARINGS; b++) {
    const bearing = (360 / BEARINGS) * b;
    for (const km of PROBE_KM) {
      points.push(destination(beach.lat, beach.lon, bearing, km));
    }
  }
  return points;
}

async function elevations(points, attempt = 0) {
  const url =
    `https://api.open-meteo.com/v1/elevation?latitude=${points.map(p => p.lat.toFixed(4)).join(',')}` +
    `&longitude=${points.map(p => p.lon.toFixed(4)).join(',')}`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    if (attempt >= 8) throw new Error(`Elevation API unreachable: ${err.message}`);
    await sleep(5000);
    return elevations(points, attempt + 1);
  }

  if (res.status === 429) {
    if (attempt >= 10) throw new Error('Elevation API kept rate limiting');
    // The limit is per minute, so waiting out the window beats hammering it.
    const wait = Math.min(65_000, 15_000 * (attempt + 1));
    log(`    rate limited, waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
    return elevations(points, attempt + 1);
  }
  if (!res.ok) throw new Error(`Elevation API ${res.status}`);

  const body = await res.json();
  // A JSON error body still arrives with HTTP 200 on this endpoint.
  if (body.error) {
    if (attempt >= 10) throw new Error(`Elevation API: ${body.reason}`);
    log(`    ${body.reason}, waiting 65s`);
    await sleep(65_000);
    return elevations(points, attempt + 1);
  }

  return body.elevation ?? [];
}

/** Circular mean of a set of bearings, in degrees. */
function meanBearing(bearings) {
  let x = 0;
  let y = 0;
  for (const b of bearings) {
    const rad = (b * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Longest run of consecutive open-water bearings, wrapping around north. */
function longestOpenArc(isOpen) {
  const n = isOpen.length;
  if (isOpen.every(Boolean)) return { length: n, bearings: isOpen.map((_, i) => (360 / n) * i) };

  let best = { length: 0, bearings: [] };
  for (let start = 0; start < n; start++) {
    if (!isOpen[start] || isOpen[(start - 1 + n) % n]) continue; // only run starts
    const run = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (!isOpen[i]) break;
      run.push((360 / n) * i);
    }
    if (run.length > best.length) best = { length: run.length, bearings: run };
  }
  return best;
}

function analyse(beach, values) {
  const isOpen = [];
  for (let b = 0; b < BEARINGS; b++) {
    const samples = PROBE_KM.map((_, d) => values[b * PROBE_KM.length + d]);
    if (samples.some(v => typeof v !== 'number')) {
      isOpen.push(false);
      continue;
    }
    // Open water all the way out: no land blocking the swell on this bearing.
    isOpen.push(samples.every(v => v <= SEA_LEVEL_M));
  }

  const arc = longestOpenArc(isOpen);
  if (arc.length < MIN_OPEN_ARC) {
    return { surfable: false, reason: `open arc of only ${arc.length * 22.5} degrees` };
  }

  const facing = Math.round(meanBearing(arc.bearings));
  const halfArc = (arc.length * (360 / BEARINGS)) / 2;

  return {
    surfable: true,
    facing,
    exposureDeg: Math.round(arc.length * (360 / BEARINGS)),
    // The swell window is the open arc itself: swell from outside it is blocked.
    swellWindow: {
      minAngle: Math.round((facing - halfArc + 360) % 360),
      maxAngle: Math.round((facing + halfArc) % 360),
    },
    // Offshore wind blows from the land, opposite the way the beach faces.
    offshoreWindAngle: Math.round((facing + 180) % 360),
  };
}

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generic ranges by skill level. OSM knows nothing about how a given bank
 * breaks, so these are honest defaults rather than invented per-spot numbers.
 */
const IDEAL_HEIGHT = {
  beginner: { min: 0.4, max: 1.2 },
  intermediate: { min: 1.0, max: 2.5 },
  expert: { min: 2.0, max: 5.0 },
};

async function main() {
  const beaches = JSON.parse(await readFile(IN_PATH, 'utf8'));
  log(`Analysing ${beaches.length} shore features for ocean exposure...`);

  const spots = [];
  const dropped = [];
  const usedIds = new Set();
  const usedCoords = new Set();

  for (let i = 0; i < beaches.length; i += BATCH_BEACHES) {
    const batch = beaches.slice(i, i + BATCH_BEACHES);
    const points = batch.flatMap(probePoints);

    let values;
    try {
      values = await elevations(points);
    } catch (err) {
        log(`  elevation batch failed: ${err.message}`);
      batch.forEach(b => dropped.push({ name: b.name, community: b.community, reason: `elevation failed: ${err.message}` }));
      continue;
    }

    const perBeach = points.length / batch.length;
    batch.forEach((beach, b) => {
      const slice = values.slice(b * perBeach, (b + 1) * perBeach);
      const result = analyse(beach, slice);

      if (!result.surfable) {
        dropped.push({ name: beach.name, community: beach.community, reason: result.reason });
        return;
      }

      const coordKey = `${beach.lat},${beach.lon}`;
      if (usedCoords.has(coordKey)) {
        dropped.push({ name: beach.name, community: beach.community, reason: 'duplicate coordinate' });
        return;
      }
      usedCoords.add(coordKey);

      let id = slugify(beach.name);
      if (usedIds.has(id)) id = `${id}-${beach.osmId}`;
      usedIds.add(id);

      spots.push({
        id,
        name: beach.name,
        community: beach.community,
        country: beach.country ?? 'Spain',
        type: 'Beach',
        coordinates: { lat: beach.lat, lon: beach.lon },
        config: {
          swellWindow: result.swellWindow,
          offshoreWindAngle: result.offshoreWindAngle,
          windTolerance: 45,
          idealHeight: IDEAL_HEIGHT,
        },
        provenance: {
          source: 'openstreetmap-overpass',
          osmType: beach.osmType,
          osmId: beach.osmId,
          feature: beach.feature ?? 'beach',
          facingDeg: result.facing,
          exposureDeg: result.exposureDeg,
          retrievedAt: new Date().toISOString().slice(0, 10),
        },
      });
    });

    if (i % 200 === 0) {
      log(`  ${i}/${beaches.length} analysed, ${spots.length} surfable`);
    }
    await sleep(REQUEST_PAUSE_MS);
  }

  await writeFile(OUT_PATH, JSON.stringify(spots, null, 1) + '\n');
  await writeFile(
    REPORT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), kept: spots.length, dropped }, null, 1) + '\n'
  );

  const byCommunity = {};
  spots.forEach(s => (byCommunity[s.community] = (byCommunity[s.community] ?? 0) + 1));

  log(`DONE. Surfable: ${spots.length} / ${beaches.length}. Dropped ${dropped.length}.`);
  log(JSON.stringify(byCommunity));
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
