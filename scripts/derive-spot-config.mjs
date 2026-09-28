#!/usr/bin/env node
/**
 * Stage 2 of the national catalogue: work out which OSM beaches actually face
 * open ocean, which way they face, and the surf config that follows.
 *
 * The method lives in scripts/lib/exposure.mjs, shared with stage 3.5b: a
 * beach needs a contiguous arc of open water to be surfable -- a cove inside a
 * ría has water in front of it but no swell window, and this is what separates
 * the two without anyone judging spots by hand.
 *
 *   node scripts/derive-spot-config.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { Bathymetry } from './lib/bathymetry.mjs';
import { probePoints, analyse, slugify, TYPE_OF_FEATURE, IDEAL_HEIGHT } from './lib/exposure.mjs';

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

const LOG_PATH = process.env.CATALOG_LOG;

/** Unbuffered, so a long run can be watched while it happens. */
function log(line) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(stamped);
  if (LOG_PATH) appendFileSync(LOG_PATH, stamped + '\n');
}

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
