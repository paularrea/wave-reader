#!/usr/bin/env node
/**
 * Regenerates src/data/spots.json with coordinates traceable to OpenStreetMap.
 *
 * Every candidate must resolve to a coastal feature AND sit in the coastal
 * elevation band (0 < elevation < 100 m). Anything that fails is dropped, not
 * guessed -- a surf spot with invented coordinates is worse than no spot.
 *
 * Run manually (Nominatim allows 1 req/s and forbids heavy automated use);
 * the output is committed so the Vercel build stays hermetic.
 *
 *   node scripts/build-spot-catalog.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const SEED_PATH = new URL('../src/data/spots.seed.json', import.meta.url);
const OUT_PATH = new URL('../src/data/spots.json', import.meta.url);
const REPORT_PATH = new URL('../src/data/spots.catalog-report.json', import.meta.url);

const USER_AGENT = 'wave-reader-catalog-builder/1.0 (https://github.com/paularrea/wave-reader)';
const NOMINATIM_DELAY_MS = 1100; // Nominatim usage policy: max 1 req/s.

/**
 * Feature types that denote the water's edge you actually surf.
 *
 * Deliberately narrow: an earlier, looser set accepted `cape`, `cliff` and
 * `islet`, which matched the headland next to Pantin and an islet off La
 * Lanzada instead of the beaches themselves. A headland 2 km from the peak is
 * a wrong coordinate dressed up as a right one.
 */
const FEATURE_SCORES = new Map([
  ['beach', 3],
  ['bay', 2],
  ['reef', 2],
]);

/**
 * Autonomous community as OSM spells it, keyed by the value used in the seed.
 * Requiring this match is what stops "Playa de Esteiro" resolving to a
 * same-named beach three provinces away.
 */
const COMMUNITY_ALIASES = new Map([
  ['galicia', ['galicia']],
  ['pais vasco', ['pais vasco', 'euskadi', 'euskal herria', 'basque country']],
  ['andalucia', ['andalucia']],
  ['canarias', ['canarias', 'islas canarias']],
  ['baleares', ['baleares', 'illes balears', 'islas baleares']],
]);

/** Strips accents so "Andalucia" and "Andalucía" compare equal. */
function normalize(value) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesCommunity(hit, community) {
  // Keys are normalized, so this lookup actually finds the alias list. An
  // earlier version compared an accented key against unaccented ones, silently
  // fell back to the bare name, and dropped every Basque spot because OSM
  // labels the region "Euskadi".
  const aliases = COMMUNITY_ALIASES.get(normalize(community)) ?? [normalize(community)];
  const state = normalize(hit.address?.state);
  return aliases.some(alias => state === normalize(alias));
}

const MIN_ELEVATION_M = 0;   // exclusive: 0 m means open water
const MAX_ELEVATION_M = 100; // exclusive: above this we are inland

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim ${res.status} for "${query}"`);
  return res.json();
}

/** ~300 m offsets, enough to step off a beach node onto the land behind it. */
const PROBE_OFFSET_DEG = 0.0027;

/**
 * Samples the candidate plus four points around it in one request.
 *
 * A beach node often sits exactly on the waterline and reads 0 m, which is
 * indistinguishable from open ocean by elevation alone. Looking at the
 * neighbourhood separates the two: a real beach has land within a few hundred
 * metres, a point in the middle of the sea does not.
 */
async function probeElevation(lat, lon) {
  const lats = [lat, lat + PROBE_OFFSET_DEG, lat - PROBE_OFFSET_DEG, lat, lat];
  const lons = [lon, lon, lon, lon + PROBE_OFFSET_DEG, lon - PROBE_OFFSET_DEG];

  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lons.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Elevation API ${res.status}`);

  const values = (await res.json()).elevation;
  if (!Array.isArray(values) || values.length === 0) return null;

  return { center: values[0], maxNearby: Math.max(...values.filter(v => typeof v === 'number')) };
}

/**
 * The seed name, stripped of articles and parenthetical aliases, for comparing
 * against what OSM actually returned.
 */
function baseName(name) {
  return normalize(name)
    .replace(/\s*\(.*\)\s*/, '')
    .replace(/^(playa de|playa|praia de|praia|platja de)\s+/, '')
    .trim();
}

/**
 * Requires the spot's own name to appear somewhere in the matched place.
 *
 * Feature type, community and elevation together still let a neighbouring
 * beach win: "Playa de Razo" resolved to Praia de Baldaio and "Louro" to Praia
 * dos Muños -- both real Galician beaches, both the wrong one. Matching against
 * the full display name rather than the feature name keeps spots OSM labels in
 * another language (Zarautz -> "Inurritzako hondartza") while rejecting a beach
 * that has nothing to do with the name we asked for.
 */
function nameMatches(hit, spotName) {
  return normalize(hit.display_name).includes(baseName(spotName));
}

function featureScore(hit) {
  return FEATURE_SCORES.get(hit.type) ?? FEATURE_SCORES.get(hit.addresstype) ?? 0;
}

/**
 * Query variants tried for one spot.
 *
 * Both the Galician and Castilian forms are generated, with and without the
 * "de" article: OSM names Galician beaches "Praia de X", and dropping the
 * article is enough to miss the beach and match a nearby landform instead.
 * Parenthetical aliases in the seed ("Louro (Playa Area Maior)") are split so
 * the alias gets its own attempt.
 */
function queriesFor(spot) {
  const withoutAlias = spot.name.replace(/\s*\(.*\)\s*/, '').trim();
  const alias = spot.name.match(/\((.+)\)/)?.[1]?.trim();
  const base = withoutAlias.replace(/^(Playa de|Playa|Praia de|Praia)\s+/i, '').trim();

  const names = [
    spot.name,
    withoutAlias,
    `Playa de ${base}`,
    `Praia de ${base}`,   // Galician
    `Platja de ${base}`,  // Catalan / Balearic
    `${base} hondartza`,  // Basque
    `Playa ${base}`,
    `Praia ${base}`,
    base,
    alias,
  ].filter(Boolean);

  // Preserve order but drop repeats, so an unprefixed name is not queried twice.
  return [...new Set(names)].map(name => `${name}, ${spot.community}, España`);
}

/**
 * Gathers candidates from every query, then picks the best one rather than
 * taking the first hit that passes. Query order alone is a poor signal: the
 * bare spot name often matches a nearby landform before the beach itself.
 */
async function resolveSpot(spot) {
  const attempts = [];
  const candidates = [];

  for (const query of queriesFor(spot)) {
    let hits;
    try {
      hits = await geocode(query);
    } catch (err) {
      attempts.push({ query, outcome: `geocode failed: ${err.message}` });
      await sleep(NOMINATIM_DELAY_MS);
      continue;
    }
    await sleep(NOMINATIM_DELAY_MS);

    if (hits.length === 0) {
      attempts.push({ query, outcome: 'no hits' });
      continue;
    }

    for (const hit of hits) {
      const score = featureScore(hit);
      if (score === 0) {
        attempts.push({ query, outcome: `skipped ${hit.class}/${hit.type}: not a surfable feature` });
        continue;
      }
      if (!matchesCommunity(hit, spot.community)) {
        attempts.push({
          query,
          outcome: `skipped ${hit.display_name?.slice(0, 50)}: in ${hit.address?.state}, expected ${spot.community}`,
        });
        continue;
      }
      if (!nameMatches(hit, spot.name)) {
        attempts.push({
          query,
          outcome: `skipped ${hit.display_name?.slice(0, 50)}: name does not match "${spot.name}"`,
        });
        continue;
      }
      candidates.push({ hit, score, query });
    }
  }

  if (candidates.length === 0) {
    return { ok: false, reason: 'no candidate matched both feature type and community', attempts };
  }

  // Best feature type wins; ties fall back to Nominatim's own ranking.
  candidates.sort((a, b) => b.score - a.score || b.hit.importance - a.hit.importance);

  for (const { hit, query } of candidates) {
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    const probe = await probeElevation(lat, lon);

    if (probe === null) {
      attempts.push({ query, outcome: `elevation unavailable for ${lat},${lon}` });
      continue;
    }
    if (probe.maxNearby <= MIN_ELEVATION_M) {
      attempts.push({
        query,
        outcome: `rejected ${lat},${lon}: no land within 300 m -> open water`,
      });
      continue;
    }
    if (probe.center >= MAX_ELEVATION_M) {
      attempts.push({ query, outcome: `rejected ${lat},${lon}: ${probe.center} m -> inland` });
      continue;
    }

    return {
      ok: true,
      spot: {
        ...spot,
        coordinates: { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) },
        provenance: {
          source: 'openstreetmap-nominatim',
          osmType: hit.osm_type,
          osmId: hit.osm_id,
          displayName: hit.display_name,
          featureType: `${hit.class}/${hit.type}`,
          elevationM: probe.center,
          nearbyLandElevationM: probe.maxNearby,
          query,
          retrievedAt: new Date().toISOString().slice(0, 10),
        },
      },
    };
  }

  return { ok: false, reason: 'every candidate failed the elevation check', attempts };
}

async function main() {
  const seed = JSON.parse(await readFile(SEED_PATH, 'utf8'));
  console.log(`Resolving ${seed.length} seed spots against OpenStreetMap...\n`);

  const kept = [];
  const dropped = [];

  for (const [i, spot] of seed.entries()) {
    process.stdout.write(`[${i + 1}/${seed.length}] ${spot.name} ... `);
    const result = await resolveSpot(spot);

    if (result.ok) {
      kept.push(result.spot);
      const { lat, lon } = result.spot.coordinates;
      console.log(`OK ${lat},${lon} (${result.spot.provenance.elevationM} m)`);
    } else {
      dropped.push({ id: spot.id, name: spot.name, community: spot.community, ...result });
      console.log('DROPPED');
    }
  }

  // Coordinates must be unique: two spots sharing a point means one is wrong.
  const seen = new Map();
  const deduped = [];
  for (const spot of kept) {
    const key = `${spot.coordinates.lat},${spot.coordinates.lon}`;
    if (seen.has(key)) {
      dropped.push({
        id: spot.id,
        name: spot.name,
        community: spot.community,
        ok: false,
        reason: `duplicate coordinate, already claimed by "${seen.get(key)}"`,
      });
      continue;
    }
    seen.set(key, spot.name);
    deduped.push(spot);
  }

  await writeFile(OUT_PATH, JSON.stringify(deduped, null, 2) + '\n');
  await writeFile(
    REPORT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), kept: deduped.length, dropped }, null, 2) + '\n'
  );

  console.log(`\nKept ${deduped.length} / ${seed.length}. Dropped ${dropped.length}.`);
  console.log(`Catalog -> ${OUT_PATH.pathname}`);
  console.log(`Report  -> ${REPORT_PATH.pathname}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
