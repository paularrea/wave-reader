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
import { Bathymetry } from './lib/bathymetry.mjs';

const IN_PATH = new URL('../src/data/osm-beaches.raw.json', import.meta.url);
const OUT_PATH = new URL('../src/data/spots.json', import.meta.url);
const REPORT_PATH = new URL('../src/data/spots.catalog-report.json', import.meta.url);
/**
 * Slim client index. The full catalogue carries surf config and provenance and
 * runs to megabytes at national scale; shipping that to the browser would put
 * it all in the JS bundle. The client only needs enough to place a marker and
 * filter by region -- roughly a fifth of the bytes.
 */
const INDEX_PATH = new URL('../src/data/spots.index.json', import.meta.url);

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
/**
 * Ireland's surf beaches sit at the head of bays facing the mouth: Lahinch in
 * Liscannor Bay, Inch in Dingle Bay, Enniscrone in Killala Bay, Portsalon in
 * Lough Swilly. 6 km out, the mouth spans only one or two bearings, so the 90
 * degree rule dropped all of them. Since stage 3.5 publishes only places a surf
 * reference names, this stage no longer has to keep ría coves out by itself;
 * for Ireland one open bearing is enough, and it still measures the window.
 * Other countries keep 90 degrees until they are re-derived on purpose.
 */
const MIN_OPEN_ARC_BY_COUNTRY = { Ireland: 1 };
/**
 * ETOPO1 returns bathymetry, so open water is genuinely negative rather than
 * the ambiguous 0 a land-only model gives for anything at sea level.
 */
const SEA_LEVEL_M = 0;

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
  if (arc.length < (MIN_OPEN_ARC_BY_COUNTRY[beach.country] ?? MIN_OPEN_ARC)) {
    return { surfable: false, reason: `open arc of only ${arc.length * (360 / BEARINGS)} degrees` };
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
 * What the spot detail calls the place. A cape is a point break, not a beach,
 * and a break stage 1.5 could only resolve to the village behind it is neither
 * -- calling Mullaghmore a beach would be a claim OSM never made.
 */
const TYPE_OF_FEATURE = {
  cape: 'Point',
  reef: 'Reef',
  island: 'Island',
  islet: 'Island',
  village: 'Break',
  town: 'Break',
  hamlet: 'Break',
  locality: 'Break',
  suburb: 'Break',
};

/**
 * Generic ranges by skill level. OSM knows nothing about how a given bank
 * breaks, so these are honest defaults rather than invented per-spot numbers.
 */
const IDEAL_HEIGHT = {
  beginner: { min: 0.4, max: 1.2 },
  intermediate: { min: 1.0, max: 2.5 },
  expert: { min: 2.0, max: 5.0 },
};

/**
 * ONLY_COUNTRIES=France,United Kingdom recomputes just those countries and
 * keeps every other country's spots and drop records exactly as they are, so
 * adding a country never silently re-rates the rest of the catalogue.
 */
function onlyCountries() {
  const raw = process.env.ONLY_COUNTRIES;
  return raw ? new Set(raw.split(',').map(c => c.trim()).filter(Boolean)) : null;
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const raw = JSON.parse(await readFile(IN_PATH, 'utf8'));
  const only = onlyCountries();

  // Older drop records predate the country field; recover it from the raw file.
  const countryOfCommunity = new Map(raw.map(b => [b.community, b.country ?? 'Spain']));
  const countryOf = entry => entry.country ?? countryOfCommunity.get(entry.community) ?? 'Spain';

  const spots = [];
  const dropped = [];
  const usedIds = new Set();
  const usedCoords = new Set();

  if (only) {
    const existing = await readJson(OUT_PATH, []);
    const report = await readJson(REPORT_PATH, { dropped: [] });
    for (const spot of existing) {
      if (only.has(countryOf(spot))) continue;
      spots.push(spot);
      usedIds.add(spot.id);
      usedCoords.add(`${spot.coordinates.lat},${spot.coordinates.lon}`);
    }
    for (const entry of report.dropped ?? []) {
      if (!only.has(countryOf(entry))) dropped.push(entry);
    }
    log(`Keeping ${spots.length} spots outside ${[...only].join(', ')}`);
  }

  const beaches = only ? raw.filter(b => only.has(b.country ?? 'Spain')) : raw;
  log(`Analysing ${beaches.length} shore features for ocean exposure...`);

  const bathymetry = new Bathymetry(log);
  await bathymetry.prepare(beaches.flatMap(probePoints));

  let kept = 0;
  beaches.forEach((beach, i) => {
    const values = probePoints(beach).map(p => bathymetry.at(p.lat, p.lon));
    const result = analyse(beach, values);
    const country = beach.country ?? 'Spain';

    if (!result.surfable) {
      dropped.push({ name: beach.name, community: beach.community, country, osmId: beach.osmId, reason: result.reason });
      return;
    }

    const coordKey = `${beach.lat},${beach.lon}`;
    if (usedCoords.has(coordKey)) {
      dropped.push({ name: beach.name, community: beach.community, country, osmId: beach.osmId, reason: 'duplicate coordinate' });
      return;
    }
    usedCoords.add(coordKey);

    // Stage 1 keeps an English name only where OSM's own is Irish (Gaeltacht
    // beaches); it is the name surfers and the surf references use.
    const name = beach.nameEn ?? beach.name;
    let id = slugify(name);
    if (!id || usedIds.has(id)) id = `${id || 'spot'}-${beach.osmId}`;
    usedIds.add(id);

    spots.push({
      id,
      name,
      community: beach.community,
      country,
      type: TYPE_OF_FEATURE[beach.feature] ?? 'Beach',
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
        ...(beach.nameEn ? { osmName: beach.name } : {}),
        facingDeg: result.facing,
        exposureDeg: result.exposureDeg,
        elevationSource: 'etopo1-erddap-bilinear',
        retrievedAt: new Date().toISOString().slice(0, 10),
      },
    });
    kept++;

    if (i % 500 === 0) log(`  ${i}/${beaches.length} analysed, ${kept} surfable`);
  });

  await writeFile(OUT_PATH, JSON.stringify(spots, null, 1) + '\n');

  const index = spots.map(s => ({
    id: s.id,
    name: s.name,
    community: s.community,
    country: s.country,
    type: s.type,
    coordinates: s.coordinates,
  }));
  await writeFile(INDEX_PATH, JSON.stringify(index) + '\n');
  await writeFile(
    REPORT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), kept: spots.length, dropped }, null, 1) + '\n'
  );

  const byCountry = {};
  spots.forEach(s => (byCountry[s.country] = (byCountry[s.country] ?? 0) + 1));
  log(`DONE. ${kept} surfable of ${beaches.length} analysed. Catalogue: ${spots.length} spots.`);
  log(JSON.stringify(byCountry));
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
