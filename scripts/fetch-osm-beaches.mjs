#!/usr/bin/env node
/**
 * Stage 1 of the national catalogue: pull every named beach in Spain's coastal
 * autonomous communities from OpenStreetMap via Overpass.
 *
 * Output is raw OSM data -- no surf judgement is applied here. Stage 2
 * (derive-spot-config.mjs) decides which of these actually face open ocean.
 *
 *   CATALOG_LOG=/tmp/osm.log node scripts/fetch-osm-beaches.mjs
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { overpass, setOverpassLogger } from './lib/overpass.mjs';

const OUT_DIR = new URL('../src/data/', import.meta.url);
const OUT_PATH = new URL('../src/data/osm-beaches.raw.json', import.meta.url);
const EMPTY_PATH = new URL('../src/data/osm-empty-regions.json', import.meta.url);
/**
 * Every region fully fetched, empty or not. Needed once a region is split into
 * subdivisions: England's beaches are stored under county names, so the region
 * name itself never appears in the raw file for RESUME to find.
 */
const FETCHED_PATH = new URL('../src/data/osm-fetched-regions.json', import.meta.url);

const LOG_PATH = process.env.CATALOG_LOG;

/** Unbuffered, so a long Overpass run can be watched while it happens. */
function log(line) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(stamped);
  if (LOG_PATH) appendFileSync(LOG_PATH, stamped + '\n');
}
setOverpassLogger(log);

/**
 * Coastal regions, keyed by ISO 3166-2 code.
 *
 * The code rather than the name: OSM labels regions in the local language and
 * sometimes bilingually ("Asturias / Asturies", "Euskadi", "Catalunya"), so
 * querying by Spanish name silently returns zero results for exactly the
 * regions whose name differs -- which is how Asturias and the Basque Country
 * came back empty on the first run.
 *
 * Only coastal regions are listed; the inland ones have no beaches to find.
 */
const REGIONS = [
  // Spain: autonomous communities, admin_level 4.
  { iso: 'ES-GA', name: 'Galicia', country: 'Spain', level: 4 },
  { iso: 'ES-AS', name: 'Asturias', country: 'Spain', level: 4 },
  { iso: 'ES-CB', name: 'Cantabria', country: 'Spain', level: 4 },
  { iso: 'ES-PV', name: 'País Vasco', country: 'Spain', level: 4 },
  { iso: 'ES-CT', name: 'Cataluña', country: 'Spain', level: 4 },
  { iso: 'ES-VC', name: 'Comunidad Valenciana', country: 'Spain', level: 4 },
  { iso: 'ES-MC', name: 'Murcia', country: 'Spain', level: 4 },
  { iso: 'ES-AN', name: 'Andalucía', country: 'Spain', level: 4 },
  { iso: 'ES-CN', name: 'Canarias', country: 'Spain', level: 4 },
  { iso: 'ES-IB', name: 'Baleares', country: 'Spain', level: 4 },
  { iso: 'ES-CE', name: 'Ceuta', country: 'Spain', level: 4 },
  { iso: 'ES-ML', name: 'Melilla', country: 'Spain', level: 4 },

  /**
   * Ireland: one country query, split by county (admin_level 6). Counties
   * rather than the four provinces: Irish surfers name breaks by county, and
   * Donegal alone spans more coast than several Spanish communities.
   *
   * Not one query per county: Irish county polygons stop at the high-water
   * line, and a beach mapped on the foreshore lies outside all of them. Queried
   * county by county, Donegal returned 15 named beaches of the 60 OSM has --
   * Carrickfinn, Rossnowlagh's Tullan, Magheroarty and Tramore among the
   * missing.
   *
   * Nor one query over the country polygon, which does run out to sea: an area
   * that size and shape times out on every public mirror. The island's bounding
   * box answers in seconds; is_in then keeps what lies inside Ireland, so
   * Northern Irish beaches in the box are dropped rather than handed to
   * Donegal or Louth by nearest neighbour.
   */
  { iso: 'IE', name: 'Ireland', country: 'Ireland', level: 2, bbox: '51.3,-10.8,55.5,-5.8', subdivide: {
    filter: '["boundary"="administrative"]["admin_level"="6"]',
    within: 'IE',
    names: {
      'IE-DL': 'Donegal', 'IE-SO': 'Sligo', 'IE-LM': 'Leitrim', 'IE-MO': 'Mayo',
      'IE-G': 'Galway', 'IE-CE': 'Clare', 'IE-LK': 'Limerick', 'IE-KY': 'Kerry',
      'IE-CO': 'Cork', 'IE-WD': 'Waterford', 'IE-WX': 'Wexford', 'IE-WW': 'Wicklow',
      'IE-D': 'Dublin', 'IE-MH': 'Meath', 'IE-LH': 'Louth',
    },
  } },

  // France: régions, admin_level 4, named as OSM names them. Metropolitan
  // coast first, then the overseas régions -- La Réunion, Guadeloupe and
  // Martinique are serious surf destinations, and Spain already includes the
  // Canaries on the same principle.
  { iso: 'FR-HDF', name: 'Hauts-de-France', country: 'France', level: 4 },
  { iso: 'FR-NOR', name: 'Normandie', country: 'France', level: 4 },
  { iso: 'FR-BRE', name: 'Bretagne', country: 'France', level: 4 },
  { iso: 'FR-PDL', name: 'Pays de la Loire', country: 'France', level: 4 },
  { iso: 'FR-NAQ', name: 'Nouvelle-Aquitaine', country: 'France', level: 4 },
  { iso: 'FR-OCC', name: 'Occitanie', country: 'France', level: 4 },
  { iso: 'FR-PAC', name: "Provence-Alpes-Côte d'Azur", country: 'France', level: 4 },
  { iso: 'FR-20R', name: 'Corse', country: 'France', level: 4 },
  { iso: 'FR-RE', name: 'La Réunion', country: 'France', level: 4 },
  { iso: 'FR-971', name: 'Guadeloupe', country: 'France', level: 4 },
  { iso: 'FR-972', name: 'Martinique', country: 'France', level: 4 },
  { iso: 'FR-GF', name: 'Guyane', country: 'France', level: 4 },
  { iso: 'FR-976', name: 'Mayotte', country: 'France', level: 4 },

  // United Kingdom: the devolved nations, admin_level 4.
  { iso: 'GB-SCT', name: 'Scotland', country: 'United Kingdom', level: 4 },
  { iso: 'GB-WLS', name: 'Wales', country: 'United Kingdom', level: 4 },
  { iso: 'GB-NIR', name: 'Northern Ireland', country: 'United Kingdom', level: 4 },
  /**
   * England is one query, then split by ceremonial county. As a single region
   * it would put Cornwall and Northumberland in the same list; OSM's admin
   * level 5 in England is combined authorities, which do not even cover
   * Cornwall. Querying 48 counties one by one against an Overpass that is
   * returning 504s is not viable, so each beach is assigned its county with
   * batched is_in lookups instead.
   */
  { iso: 'GB-ENG', name: 'England', country: 'United Kingdom', level: 4, subdivide: { filter: '["boundary"="ceremonial"]' } },
];

/**
 * Feature tags that stand for "a named place on the shore you might surf".
 *
 * Spain maps beaches densely as `natural=beach`, so that alone is enough there.
 * Ireland does not: County Clare, the home of Irish surfing, has four tagged
 * beaches in OSM. Irish shore features are more often mapped as bays or
 * shingle, so the query is widened per country rather than pretending the
 * coastline is empty.
 */
const FEATURE_TAGS = {
  Spain: [['natural', 'beach']],
  Ireland: [
    ['natural', 'beach'],
    ['natural', 'shingle'],
    ['natural', 'bay'],
    /**
     * Headlands and reefs, because a third of Ireland's published breaks are
     * not beaches at all: Doolin Point, Fanad Head, Cream Point, Garywilliam
     * Point. OSM maps them as capes, which is a coordinate on the shore like
     * any other -- the reference still only contributes the name, and stage 3.5
     * still has to name it before anything is published.
     */
    ['natural', 'cape'],
    ['natural', 'reef'],
  ],
};

function queryFor(iso, level, country, bbox) {
  const tags = FEATURE_TAGS[country] ?? FEATURE_TAGS.Spain;
  const clauses = tags
    .flatMap(([key, value]) =>
      ['node', 'way', 'relation'].map(
        kind => `  ${kind}["${key}"="${value}"]["name"](${bbox ?? 'area.region'});`
      )
    )
    .join('\n');

  return `
[out:json][timeout:180];
${bbox ? '' : `area["ISO3166-2"="${iso}"]["admin_level"="${level}"]->.region;`}
(
${clauses}
);
out center tags;
`.trim();
}

/** Beaches are nodes, ways or relations; `out center` gives all three a point. */
function pointOf(element) {
  if (typeof element.lat === 'number') return { lat: element.lat, lon: element.lon };
  if (element.center) return { lat: element.center.lat, lon: element.center.lon };
  return null;
}

/**
 * In the Gaeltacht, OSM's `name` is the Irish one -- "Trá Mhachaire
 * Rabhartaigh" for Magheroarty, "Trá na Brád" for Braade -- and no surf
 * reference, and few surfers, call those beaches that. The English name OSM
 * carries alongside is kept for Irish features only: elsewhere `name:en` is a
 * translation for tourists ("La Concha Beach"), not the name used locally.
 */
function englishName(tags, country) {
  const en = tags['name:en'];
  return country === 'Ireland' && en && en !== tags.name ? { nameEn: en } : {};
}

const SUBDIVISION_BATCH = 250;

const NOMINATIM = 'https://nominatim.openstreetmap.org/lookup';
const NOMINATIM_BATCH = 50; // the most ids /lookup takes per request
const USER_AGENT = 'wave-reader-catalog/1.0 (https://github.com/paularrea/wave-reader)';

/**
 * The county of each beach no county polygon contains, from the address
 * Nominatim computes for the OSM object itself. Nearest resolved beach was the
 * fallback before, and with three in four Irish beaches outside every polygon
 * it guessed wrong at the borders: Fanore went to Galway, Lacken to Sligo.
 * Nominatim places both in the right county; what it cannot place still falls
 * back to the nearest neighbour. One request a second, per its usage policy.
 */
async function assignByNominatim(beaches, names, parentName) {
  const todo = beaches.filter(b => b.community === parentName);
  for (let start = 0; start < todo.length; start += NOMINATIM_BATCH) {
    const batch = todo.slice(start, start + NOMINATIM_BATCH);
    const ids = batch.map(b => `${b.osmType[0].toUpperCase()}${b.osmId}`).join(',');
    let places = [];
    try {
      const res = await fetch(`${NOMINATIM}?osm_ids=${ids}&format=json&addressdetails=1`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) places = await res.json();
      else log(`    Nominatim ${res.status}; leaving ${batch.length} to nearest neighbour`);
    } catch (err) {
      log(`    Nominatim failed (${err.message}); leaving ${batch.length} to nearest neighbour`);
    }
    for (const place of places) {
      const code = place.address?.['ISO3166-2-lvl6'];
      const beach = batch.find(b => b.osmId === Number(place.osm_id) && b.osmType === place.osm_type);
      if (beach && code) beach.community = names[code] ?? code;
    }
    await sleep(1100);
  }
}

/**
 * Sets each beach's `community` to the subdivision containing it, using
 * Overpass is_in(lat,lon) in batches. A marker element is emitted before each
 * point's areas so the flat output can be mapped back to the right beach.
 *
 * Beach centroids often sit on the waterline, just outside a county polygon
 * drawn to the high-water line; those take the county of the nearest beach
 * that did resolve, rather than being dumped into a catch-all region.
 *
 * `names` maps ISO 3166-2 codes to the region names the app uses. When given,
 * it is also the list of subdivisions kept: a country query returns lake
 * beaches in inland counties too, and those are dropped here. `within` (an
 * ISO 3166-1 code) drops whatever a bounding-box query caught across a border.
 */
async function assignSubdivisions(beaches, { filter, names, within }, parentName) {
  const inside = new Set();
  for (let start = 0; start < beaches.length; start += SUBDIVISION_BATCH) {
    const batch = beaches.slice(start, start + SUBDIVISION_BATCH);
    const statements = batch
      .map(
        (b, i) =>
          `make marker idx="${i}"; out; ` +
          `is_in(${b.lat},${b.lon})->.a; area.a${filter}; out tags;` +
          (within ? ` area.a["ISO3166-1"="${within}"]["admin_level"="2"]; out tags;` : '')
      )
      .join('\n');

    const data = await overpass(`[out:json][timeout:180];\n${statements}`);

    let current = -1;
    for (const element of data.elements ?? []) {
      if (element.type === 'marker') {
        current = Number(element.tags?.idx);
        continue;
      }
      if (within && current >= 0 && element.tags?.['ISO3166-1'] === within) {
        inside.add(batch[current]);
        continue;
      }
      const name = names ? names[element.tags?.['ISO3166-2']] ?? element.tags?.['ISO3166-2'] : element.tags?.name;
      if (current >= 0 && name && batch[current].community === parentName) {
        batch[current].community = name;
      }
    }

    log(`    ${parentName}: assigned ${Math.min(start + SUBDIVISION_BATCH, beaches.length)}/${beaches.length}`);
    await sleep(4000);
  }

  if (within) {
    const outside = beaches.length - inside.size;
    beaches = beaches.filter(b => inside.has(b));
    log(`    ${parentName}: ${outside} outside ${within} dropped`);
  }
  if (names) {
    const before = beaches.filter(b => b.community === parentName).length;
    await assignByNominatim(beaches, names, parentName);
    const after = beaches.filter(b => b.community === parentName).length;
    log(`    ${parentName}: ${before - after} more by Nominatim address`);
  }
  const resolved = beaches.filter(b => b.community !== parentName);
  const unresolved = beaches.filter(b => b.community === parentName);
  for (const beach of unresolved) {
    let best = null;
    for (const other of resolved) {
      const d = (other.lat - beach.lat) ** 2 + ((other.lon - beach.lon) * Math.cos((beach.lat * Math.PI) / 180)) ** 2;
      if (!best || d < best.d) best = { d, community: other.community };
    }
    if (best) beach.community = best.community;
  }
  log(`    ${parentName}: ${resolved.length} by polygon, ${unresolved.length} by nearest neighbour`);
  if (!names) return beaches;

  const listed = new Set(Object.values(names));
  const kept = beaches.filter(b => listed.has(b.community));
  log(`    ${parentName}: ${beaches.length - kept.length} outside the listed subdivisions dropped`);
  return kept;
}

/**
 * VERIFY=1 compares every region's fetched count with an Overpass `out count`
 * for the same query, and re-fetches the regions that come up short.
 *
 * Needed because a truncated response does not always carry a `remark`: the
 * first run kept 25 of Normandie's 38 named beaches with no sign of trouble.
 */
/**
 * Fetches a region and checks the element count against `out count` before
 * accepting it, retrying when short.
 *
 * Overpass mirrors can answer with a complete, well-formed JSON that is simply
 * missing elements, and no `remark` says so: a re-fetch of Andalucía came back
 * with 150 of its 507 beaches. Only comparing against a count catches that.
 */
async function fetchComplete(iso, level, country, name, bbox, attempt = 0) {
  const data = await overpass(queryFor(iso, level, country, bbox));
  const have = (data.elements ?? []).length;

  let expected = null;
  try {
    const counted = await overpass(queryFor(iso, level, country, bbox).replace('out center tags;', 'out count;'));
    expected = Number(counted.elements?.[0]?.tags?.total ?? NaN);
  } catch (err) {
    log(`    ${name}: could not count (${err.message}); accepting ${have} unverified`);
    return data;
  }

  if (!Number.isFinite(expected) || have >= expected) return data;
  if (attempt >= 5) throw new Error(`still short after retries: ${have} of ${expected}`);

  log(`    ${name}: got ${have} of ${expected}, retrying`);
  await sleep(15_000);
  return fetchComplete(iso, level, country, name, bbox, attempt + 1);
}

async function verify() {
  const beaches = JSON.parse(await readFile(OUT_PATH, 'utf8'));
  let fetched = [];
  try {
    fetched = JSON.parse(await readFile(FETCHED_PATH, 'utf8'));
  } catch {
    // nothing recorded
  }

  const short = [];
  for (const { iso, name, country, level, subdivide } of REGIONS) {
    // Ireland's country query also counts lake beaches in inland counties,
    // which the split drops, so its count is checked at fetch time only.
    if (subdivide?.names) {
      log(`  ${name}: count-checked when fetched, skipping`);
      continue;
    }
    const countQuery = queryFor(iso, level, country).replace('out center tags;', 'out count;');
    let expected;
    try {
      const data = await overpass(countQuery);
      expected = Number(data.elements?.[0]?.tags?.total ?? NaN);
    } catch (err) {
      log(`  ${name}: count failed (${err.message}), skipping`);
      continue;
    }

    // A subdivided region's beaches are stored under its subdivisions' names.
    const have = subdivide
      ? beaches.filter(b => b.country === country && b.parentRegion === name).length
      : beaches.filter(b => b.community === name).length;

    const status = have >= expected ? 'ok' : `SHORT by ${expected - have}`;
    log(`  ${name}: have ${have}, Overpass counts ${expected} -> ${status}`);
    if (have < expected) short.push(name);
    await sleep(3000);
  }

  if (short.length === 0) {
    log('VERIFY: every region complete');
    return;
  }

  log(`VERIFY: re-fetching ${short.join(', ')}`);
  const shortSet = new Set(short);
  const isShort = b => shortSet.has(b.community) || shortSet.has(b.parentRegion);
  await writeFile(OUT_PATH, JSON.stringify(beaches.filter(b => !isShort(b)), null, 1) + '\n');
  await writeFile(FETCHED_PATH, JSON.stringify(fetched.filter(r => !shortSet.has(r)), null, 1) + '\n');
  process.env.RESUME = '1';
  await main();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Resume support: regions already in the file are skipped, so adding a
  // country does not mean re-querying everything Overpass already gave us.
  let beaches = [];
  /**
   * Regions with no matching features leave no trace in the raw file, so they
   * are tracked separately: otherwise every resumed run re-queries County Meath
   * and Louth, which have none, against a service already prone to 504s.
   */
  let emptyRegions = new Set();
  if (process.env.RESUME) {
    try {
      beaches = JSON.parse(await readFile(OUT_PATH, 'utf8'));
      log(`Resuming with ${beaches.length} beaches already fetched`);
    } catch {
      log('Nothing to resume from; starting fresh');
    }
    try {
      emptyRegions = new Set(JSON.parse(await readFile(EMPTY_PATH, 'utf8')));
    } catch {
      // No record yet; empty regions will be discovered and written below.
    }
  }
  let fetchedRegions = new Set();
  if (process.env.RESUME) {
    try {
      fetchedRegions = new Set(JSON.parse(await readFile(FETCHED_PATH, 'utf8')));
    } catch {
      // Older runs did not write this file; community names cover them.
    }
  }
  const alreadyFetched = new Set([
    ...beaches.map(b => b.community),
    ...emptyRegions,
    ...fetchedRegions,
  ]);

  const markFetched = async name => {
    fetchedRegions.add(name);
    await writeFile(FETCHED_PATH, JSON.stringify([...fetchedRegions], null, 1) + '\n');
  };

  const onlyRegions = process.env.ONLY_REGIONS
    ? new Set(process.env.ONLY_REGIONS.split(',').map(r => r.trim()))
    : null;

  for (const { iso, name: community, country, level, subdivide, bbox } of REGIONS) {
    if (onlyRegions && !onlyRegions.has(community)) continue;
    if (alreadyFetched.has(community)) {
      log(`${community}: already fetched, skipping`);
      continue;
    }
    log(`${community} (${iso}): querying...`);

    let data;
    try {
      data = await fetchComplete(iso, level, country, community, bbox);
    } catch (err) {
      log(`    ${community} FAILED: ${err.message}`);
      continue;
    }

    let kept = 0;
    const fromThisRegion = [];
    for (const element of data.elements ?? []) {
      const point = pointOf(element);
      const name = element.tags?.name;
      if (!point || !name) continue;

      fromThisRegion.push({
        osmType: element.type,
        osmId: element.id,
        name,
        community,
        country,
        lat: Number(point.lat.toFixed(5)),
        lon: Number(point.lon.toFixed(5)),
        feature: element.tags.natural ?? 'beach',
        ...englishName(element.tags, country),
      });
      kept++;
    }

    if (subdivide && fromThisRegion.length > 0) {
      fromThisRegion.forEach(b => (b.parentRegion = community));
      try {
        const assigned = await assignSubdivisions(fromThisRegion, subdivide, community);
        fromThisRegion.splice(0, fromThisRegion.length, ...assigned);
      } catch (err) {
        log(`    ${community} subdivision FAILED: ${err.message} -- not saved, rerun with RESUME=1`);
        continue;
      }
    }
    beaches.push(...fromThisRegion);

    log(`${community}: ${fromThisRegion.length} beaches (running total ${beaches.length})`);
    if (kept === 0) {
      log(`    ${community} returned nothing -- recorded so RESUME skips it`);
      emptyRegions.add(community);
      await writeFile(EMPTY_PATH, JSON.stringify([...emptyRegions], null, 1) + '\n');
    }

    // Save as we go: a failure late in the list must not discard the rest.
    await writeFile(OUT_PATH, JSON.stringify(beaches, null, 1) + '\n');
    await markFetched(community);
    await sleep(4000); // be a good Overpass citizen
  }

  log(`DONE. ${beaches.length} named beaches -> ${OUT_PATH.pathname}`);
}

(process.env.VERIFY ? verify() : main()).catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
