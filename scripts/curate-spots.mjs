/**
 * Stage 4: turn the catalogue of OSM shore features into a catalogue of surf
 * spots, and publish it one file per country.
 *
 * OpenStreetMap tags every named beach, so stage 2 hands over 7,870 places for
 * four countries -- 600 of them in Catalunya, where surf-forecast lists 29.
 * Three independent reasons most of them must not be in a surf app:
 *
 *   1. Nothing breaks there: harbour coves, marina basins, inner-ria beaches.
 *   2. It is the same sea: the marine model's cell is about 5 km, so two
 *      beaches 800 m apart share one forecast. Showing both is fake precision.
 *   3. It is not a surf place at all: docks, quays, jetties, inland water.
 *
 * The filter is deliberately explainable, and every drop is recorded with its
 * reason in spots.curation-report.json so the reduction can be audited and
 * reversed.
 *
 *   node scripts/curate-spots.mjs           # write the catalogue
 *   node scripts/curate-spots.mjs --dry-run # counts only, writes nothing
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const IN_PATH = new URL('../src/data/spots.json', import.meta.url);
const CURATED_PATH = new URL('../src/data/surf-spots.curated.json', import.meta.url);
const OUT_DIR = new URL('../src/data/spots/', import.meta.url);
const REGIONS_PATH = new URL('../src/data/regions.json', import.meta.url);
const REPORT_PATH = new URL('../src/data/spots.curation-report.json', import.meta.url);

const ISO2 = {
  Spain: 'es',
  France: 'fr',
  'United Kingdom': 'gb',
  Ireland: 'ie',
};

/**
 * Open-Meteo's marine models run at roughly this resolution, so places closer
 * than this to each other are served the same forecast.
 */
const MODEL_CELL_KM = 5;

/** Swell needs an arc of open water to arrive through. */
const MIN_EXPOSURE_DEG = 120;

/** Places that are water but not surf: docks, marinas, inland water. */
const NOT_SURF = /(\bmarina\b|d[àa]rsena|\bmoll\b|\bmuelle\b|club\s*(n[àa]utic|n[áa]utico|de\s*mar)|embarcader|\bdique\b|espig[oó]n|\bpiscina\b|\bestany\b|\blago\b|\bllac\b|embalse|albufera|\bcanal\b|\bdock\b|\bquay\b|\bjetty\b|slipway|\bharbour\b|\bharbor\b|zona dunar|\bmarisma)/i;

/**
 * A cove is a pocket of water between headlands: sheltered from the side by
 * definition, and small enough that nobody drives to it to surf. OSM maps
 * hundreds of them, especially on the Mediterranean. A cove that is a known
 * break survives through the curated list.
 */
const COVE = /(\bcala\b|\bcaleta\b|\bcalita\b|\bplatgeta\b|\brac[oó]\b|\bcova\b|\bensenada\b|\benseada\b|\bangra\b|\bcove\b)/i;

/** Stretches of a beach set aside for something other than surfing. */
const SECTION = /(naturista|nudista|gossos|\bperros\b|canina|infantil|surf\s*school)/i;

/** A port unless the name says it is the beach next to one. */
const PORT = /(\bport\b|\bporto\b|\bpuerto\b|\bports\b)/i;
const BEACH = /(\bpraia\b|\bplaya\b|\bplatja\b|\bplage\b|\bbeach\b|\bstrand\b|\barea\b|\bcala\b|\banse\b|\btr[áa]\b|\btraeth\b|\bhondartza\b)/i;

function normalise(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(praia|playa|platja|plage|beach|strand|traeth|hondartza|sands|cala|caleta|anse|de|del|dels|des|du|da|do|das|dos|la|le|les|los|el|els|s|sa|a|o|of|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Basque, Galician and Welsh OSM names carry a genitive the curated name does
 * not: Zarautz is mapped as "Zarauzko hondartza", Orio as "Orioko hondartza".
 * Two tokens are the same place when one is the other's stem, or when they
 * share a long enough stem that only the inflection differs.
 */
function sameToken(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.startsWith(short) && long.length - short.length <= 3) return true;
  if (short.length < 5 || long.length - short.length > 4) return false;
  let common = 0;
  while (common < short.length && short[common] === long[common]) common++;
  return common >= 5;
}

function tokensMatch(spotKey, curatedKey) {
  const curatedTokens = curatedKey.split(' ').filter(t => t.length >= 4);
  if (curatedTokens.length === 0) return false;
  const spotTokens = spotKey.split(' ');
  return curatedTokens.every(c => spotTokens.some(s => sameToken(s, c)));
}

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
const curated = JSON.parse(readFileSync(CURATED_PATH));

/** Curated names per "country|region", normalised once. */
const curatedIndex = new Map();
for (const [country, regions] of Object.entries(curated)) {
  if (country.startsWith('_')) continue;
  for (const [region, names] of Object.entries(regions)) {
    // The order in the file is editorial: when two named breaks share a
    // forecast cell, the one listed first is the one surfers would name.
    curatedIndex.set(
      `${country}|${region}`,
      names.map((n, rank) => ({ raw: n, key: normalise(n), rank }))
    );
  }
}

/** The curated name this place answers to, or null. */
function curatedMatch(spot) {
  const names = curatedIndex.get(`${spot.country}|${spot.community}`);
  if (!names) return null;
  const key = normalise(spot.name);
  if (!key) return null;
  // Exact first: "Sant Pol" must not claim "Sant Pol de Mar" while the real one waits.
  return (
    names.find(n => n.key === key) ??
    names.find(n => n.key.length >= 4 && (key.includes(n.key) || n.key.includes(key))) ??
    names.find(n => tokensMatch(key, n.key)) ??
    null
  );
}

const dropped = [];
function drop(spot, reason) {
  dropped.push({ id: spot.id, name: spot.name, country: spot.country, region: spot.community, reason });
}

// 1. Places that are not surf spots at all.
const candidates = [];
for (const spot of spots) {
  const named = curatedMatch(spot);
  if (NOT_SURF.test(spot.name)) {
    drop(spot, 'not a surf place: harbour infrastructure or inland water');
    continue;
  }
  if (PORT.test(spot.name) && !BEACH.test(spot.name) && !named) {
    drop(spot, 'not a surf place: a port, not the beach beside one');
    continue;
  }
  if (SECTION.test(spot.name) && !named) {
    drop(spot, 'not a surf place: a section of a beach set aside for something else');
    continue;
  }
  if (COVE.test(spot.name) && !named) {
    drop(spot, 'a cove: sheltered from the side and too small to be a break');
    continue;
  }
  // 2. No arc of open water for swell to arrive through.
  if ((spot.provenance?.exposureDeg ?? 0) < MIN_EXPOSURE_DEG && !named) {
    drop(spot, `sheltered: swell window of ${spot.provenance?.exposureDeg ?? 0}deg is under ${MIN_EXPOSURE_DEG}deg`);
    continue;
  }
  candidates.push({ spot, named });
}

// 3. One spot per stretch of coast that shares a forecast cell. A named break
//    beats an unnamed neighbour; failing that, the more exposed one; failing
//    that, the plainer name, because OSM's long names are the minor coves.
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
      (b.spot.provenance?.exposureDeg ?? 0) - (a.spot.provenance?.exposureDeg ?? 0) ||
      a.spot.name.length - b.spot.name.length
  );
  const survivors = [];
  for (const c of group) {
    const near = survivors.find(s => distanceKm(s.spot.coordinates, c.spot.coordinates) < MODEL_CELL_KM);
    if (near) {
      drop(c.spot, `same forecast cell as ${near.spot.name} (${distanceKm(near.spot.coordinates, c.spot.coordinates).toFixed(1)} km)`);
      continue;
    }
    survivors.push(c);
  }
  kept.push(...survivors);
}

kept.sort((a, b) => a.spot.id.localeCompare(b.spot.id));

// Curated names nothing answered to: reported, never invented.
const matchedNames = new Set(kept.filter(k => k.named).map(k => `${k.spot.country}|${k.spot.community}|${k.named.raw}`));
const unmatched = [];
for (const [key, names] of curatedIndex) {
  for (const n of names) {
    if (!matchedNames.has(`${key}|${n.raw}`)) unmatched.push(`${key}|${n.raw}`);
  }
}

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
        modelCellKm: MODEL_CELL_KM,
        minExposureDeg: MIN_EXPOSURE_DEG,
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
