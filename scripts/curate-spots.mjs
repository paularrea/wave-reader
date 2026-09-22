/**
 * Stage 4: publish the surf spots, one file per country.
 *
 * A place is published only when two things hold:
 *
 *   1. It is attested as a surf spot (stage 3.5, src/data/surf-spots.attested.json):
 *      a published surf reference names it, and the name resolves to this
 *      exact OSM place. An exposed beach is not a surf spot; this used to
 *      publish every one of them -- 1,690 places, 1,048 of which no reference
 *      knew, including the shore of the Mar Menor lagoon.
 *   2. Its coordinate passed the check in spots.coordinate-check.json: it is on
 *      the open-sea coastline and not beside a lake or lagoon.
 *
 * What remains here is the housekeeping OSM needs whatever the reference says:
 * a stretch of beach set aside for something else (naturist, dogs) is not a
 * break, inland water never has swell, and one beach mapped twice is one spot.
 *
 * Every drop is recorded with its reason in spots.curation-report.json so the
 * reduction can be audited and reversed.
 *
 *   node scripts/curate-spots.mjs           # write the catalogue
 *   node scripts/curate-spots.mjs --dry-run # counts only, writes nothing
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { normalise, curatedMatch, curatedNames } from './lib/curated.mjs';

const IN_PATH = new URL('../src/data/spots.json', import.meta.url);
const OUT_DIR = new URL('../src/data/spots/', import.meta.url);
const REGIONS_PATH = new URL('../src/data/regions.json', import.meta.url);
const REPORT_PATH = new URL('../src/data/spots.curation-report.json', import.meta.url);
const ATTESTED_PATH = new URL('../src/data/surf-spots.attested.json', import.meta.url);
const COORDINATE_CHECK_PATH = new URL('../src/data/spots.coordinate-check.json', import.meta.url);

const ISO2 = {
  Spain: 'es',
  France: 'fr',
  'United Kingdom': 'gb',
  Ireland: 'ie',
};

/** Two entries with one name this close apart are one beach mapped twice. */
const SAME_PLACE_KM = 1.5;

/**
 * A bay's centroid sits out in its water, further from its own beach than a
 * second beach polygon would: Barley Cove the bay and Barley Cove the beach are
 * 1.8 km apart. Only Ireland is fetched with bays.
 */
const SAME_BAY_KM = 4;
/**
 * A place whose coordinate stands for a stretch of coast rather than the sand
 * itself: the bay's water, or the village stage 1.5 resolved a break to. Two of
 * those under one name are one break -- "Inch" the village and "Inch Beach" are
 * 3.2 km apart -- and when a real beach carries the name, it wins.
 */
const COARSE = new Set(['bay', 'village', 'town', 'hamlet', 'locality', 'suburb', 'island', 'islet']);
const isBay = c => COARSE.has(c.spot.provenance?.feature);

/**
 * Inland water. No reference makes a lake or a lagoon surfable, so a name that
 * says it is one is dropped even when a reference pointed near it.
 */
const INLAND = /(\bestany\b|\blago\b|\blac\b|\bllac\b|\blake\b|\bloch\b|\blough\b|[ée]tang|embalse|pantano|albufera|\blaguna\b|\bmarisma|mar menor)/i;

/** Stretches of a beach set aside for something other than surfing. */
const SECTION = /(naturist|nudist|gossos|\bperros\b|canina|infantil|surf\s*school|centre de vacances)/i;

/** Flat-earth distance: at these separations the error is under a metre. */
function distanceKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const midLat = ((a.lat + b.lat) / 2) * rad;
  return R * Math.sqrt(dLat ** 2 + (Math.cos(midLat) * dLon) ** 2);
}

const spots = JSON.parse(readFileSync(IN_PATH));
const attested = new Map(JSON.parse(readFileSync(ATTESTED_PATH)).spots.map(a => [a.id, a]));
const coordinateCheck = JSON.parse(readFileSync(COORDINATE_CHECK_PATH)).spots;

const dropped = [];
function drop(spot, reason) {
  dropped.push({ id: spot.id, name: spot.name, country: spot.country, region: spot.community, reason });
}

const candidates = [];
for (const spot of spots) {
  if (!attested.has(spot.id)) {
    drop(spot, 'not attested: no surf reference names this place');
    continue;
  }
  if (INLAND.test(spot.name)) {
    drop(spot, 'not a surf place: inland water');
    continue;
  }
  // "Saturraran naturista" is a stretch of Saturraran, not a second break.
  if (SECTION.test(spot.name)) {
    drop(spot, 'not a surf place: a section of a beach set aside for something else');
    continue;
  }
  const check = coordinateCheck[spot.id];
  if (!check) {
    drop(spot, 'coordinate not checked: run scripts/verify-spot-coordinates.mjs');
    continue;
  }
  if (!check.ok) {
    drop(spot, `coordinate rejected: ${check.reason}`);
    continue;
  }
  // A long beach's centroid sits in the dunes; the check moved it to the
  // shoreline. The original stays in the provenance so the move can be read.
  const published = check.snapped
    ? {
        ...spot,
        coordinates: { lat: check.snapped.lat, lon: check.snapped.lon },
        provenance: { ...spot.provenance, centroid: spot.coordinates, movedToShoreM: check.snapped.movedM },
      }
    : spot;
  candidates.push({ spot: published, named: curatedMatch(spot) });
}

// One beach mapped twice ("Ondres-Ocean" and "Plage Ondres-Ocean", "Plage du
// Metro" three times along a kilometre) is one spot. Distinct names are never
// merged, however close: Anglet's peaks share a model cell to the decimal, but
// La Barre and Les Cavaliers are two banks and two crowds.
const byRegion = new Map();
for (const c of candidates) {
  const key = `${c.spot.country}|${c.spot.community}`;
  if (!byRegion.has(key)) byRegion.set(key, []);
  byRegion.get(key).push(c);
}

const kept = [];
for (const group of byRegion.values()) {
  group.sort(
    (a, b) =>
      Number(Boolean(b.named)) - Number(Boolean(a.named)) ||
      (a.named?.rank ?? 0) - (b.named?.rank ?? 0) ||
      attested.get(b.spot.id).sources.length - attested.get(a.spot.id).sources.length ||
      Number(isBay(a)) - Number(isBay(b)) ||
      a.spot.name.length - b.spot.name.length
  );
  const survivors = [];
  for (const c of group) {
    const twin = survivors.find(
      s =>
        normalise(s.spot.name) === normalise(c.spot.name) &&
        distanceKm(s.spot.coordinates, c.spot.coordinates) < (isBay(s) || isBay(c) ? SAME_BAY_KM : SAME_PLACE_KM)
    );
    if (twin) {
      drop(c.spot, `the same place as ${twin.spot.name}, mapped twice in OpenStreetMap`);
      continue;
    }
    survivors.push(c);
  }
  kept.push(...survivors);
}

kept.sort((a, b) => a.spot.id.localeCompare(b.spot.id));

// Curated names nothing answered to: reported, never invented.
const matchedNames = new Set(kept.filter(k => k.named).map(k => `${k.spot.country}|${k.spot.community}|${k.named.raw}`));
const unmatched = curatedNames().filter(name => !matchedNames.has(name));

// --- Report ------------------------------------------------------------
const perRegion = new Map();
for (const { spot } of kept) {
  const key = `${spot.country}|${spot.community}`;
  perRegion.set(key, (perRegion.get(key) ?? 0) + 1);
}

console.log(`in:   ${spots.length} places`);
console.log(`out:  ${kept.length} surf spots (${dropped.length} dropped)`);
console.log(`named breaks matched: ${matchedNames.size}, curated names with no match: ${unmatched.length}`);
for (const [key, n] of [...perRegion].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${key.replace('|', ' / ')}`);
}

if (process.argv.includes('--dry-run')) process.exit(0);

// --- Write -------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });

const countries = [...new Set(kept.map(k => k.spot.country))].sort();
const regionsOut = [];
const points = [];

for (const country of countries) {
  const iso2 = ISO2[country];
  if (!iso2) throw new Error(`No ISO code for ${country}; add it to ISO2`);

  const mine = kept.filter(k => k.spot.country === country).map(k => k.spot);
  writeFileSync(new URL(`${iso2}.json`, OUT_DIR), `${JSON.stringify(mine, null, 2)}\n`);
  writeFileSync(
    new URL(`${iso2}.index.json`, OUT_DIR),
    `${JSON.stringify(
      mine.map(s => ({
        id: s.id,
        name: s.name,
        community: s.community,
        country: s.country,
        type: s.type,
        coordinates: s.coordinates,
      })),
      null,
      0
    )}\n`
  );

  const regions = [...new Set(mine.map(s => s.community))].sort((a, b) => a.localeCompare(b, 'es'));
  regionsOut.push({
    name: country,
    iso2,
    regions: regions.map(name => ({ name, spots: mine.filter(s => s.community === name).length })),
  });

  const countryIndex = regionsOut.length - 1;
  for (const s of mine) {
    points.push([
      Math.round(s.coordinates.lat * 1000) / 1000,
      Math.round(s.coordinates.lon * 1000) / 1000,
      countryIndex,
      regions.indexOf(s.community),
    ]);
  }
}

/**
 * The only catalogue file the client always loads: countries, their regions,
 * and one coarse point per spot so the nearest region to a location can be
 * resolved without downloading any country's spots. Regions interlock along
 * the coast, so nearest spot beats a bounding box.
 */
writeFileSync(REGIONS_PATH, `${JSON.stringify({ countries: regionsOut, points }, null, 0)}\n`);

writeFileSync(
  REPORT_PATH,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      rules: {
        gate: 'attested by a surf reference, and coordinate verified on the open-sea coastline',
        samePlaceKm: SAME_PLACE_KM,
      },
      in: spots.length,
      out: kept.length,
      perRegion: Object.fromEntries(perRegion),
      curatedNamesWithoutMatch: unmatched.sort(),
      dropped,
    },
    null,
    2
  )}\n`
);

console.log(`\nwrote ${countries.length} countries to src/data/spots/, regions.json and the curation report`);
