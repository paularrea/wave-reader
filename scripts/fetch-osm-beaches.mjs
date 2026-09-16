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

const OUT_DIR = new URL('../src/data/', import.meta.url);
const OUT_PATH = new URL('../src/data/osm-beaches.raw.json', import.meta.url);
const EMPTY_PATH = new URL('../src/data/osm-empty-regions.json', import.meta.url);

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

const USER_AGENT = 'wave-reader-catalog/1.0 (https://github.com/paularrea/wave-reader)';
const LOG_PATH = process.env.CATALOG_LOG;

/** Unbuffered, so a long Overpass run can be watched while it happens. */
function log(line) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(stamped);
  if (LOG_PATH) appendFileSync(LOG_PATH, stamped + '\n');
}

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

  // Ireland: counties, admin_level 6. Counties rather than the four provinces:
  // Irish surfers name breaks by county, and Donegal alone spans more coast
  // than several Spanish communities.
  { iso: 'IE-DL', name: 'Donegal', country: 'Ireland', level: 6 },
  { iso: 'IE-SO', name: 'Sligo', country: 'Ireland', level: 6 },
  { iso: 'IE-LM', name: 'Leitrim', country: 'Ireland', level: 6 },
  { iso: 'IE-MO', name: 'Mayo', country: 'Ireland', level: 6 },
  { iso: 'IE-G', name: 'Galway', country: 'Ireland', level: 6 },
  { iso: 'IE-CE', name: 'Clare', country: 'Ireland', level: 6 },
  { iso: 'IE-LK', name: 'Limerick', country: 'Ireland', level: 6 },
  { iso: 'IE-KY', name: 'Kerry', country: 'Ireland', level: 6 },
  { iso: 'IE-CO', name: 'Cork', country: 'Ireland', level: 6 },
  { iso: 'IE-WD', name: 'Waterford', country: 'Ireland', level: 6 },
  { iso: 'IE-WX', name: 'Wexford', country: 'Ireland', level: 6 },
  { iso: 'IE-WW', name: 'Wicklow', country: 'Ireland', level: 6 },
  { iso: 'IE-D', name: 'Dublin', country: 'Ireland', level: 6 },
  { iso: 'IE-MH', name: 'Meath', country: 'Ireland', level: 6 },
  { iso: 'IE-LH', name: 'Louth', country: 'Ireland', level: 6 },
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
  ],
};

function queryFor(iso, level, country) {
  const tags = FEATURE_TAGS[country] ?? FEATURE_TAGS.Spain;
  const clauses = tags
    .flatMap(([key, value]) =>
      ['node', 'way', 'relation'].map(
        kind => `  ${kind}["${key}"="${value}"]["name"](area.region);`
      )
    )
    .join('\n');

  return `
[out:json][timeout:180];
area["ISO3166-2"="${iso}"]["admin_level"="${level}"]->.region;
(
${clauses}
);
out center tags;
`.trim();
}

async function overpass(query, attempt = 0) {
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

/** Beaches are nodes, ways or relations; `out center` gives all three a point. */
function pointOf(element) {
  if (typeof element.lat === 'number') return { lat: element.lat, lon: element.lon };
  if (element.center) return { lat: element.center.lat, lon: element.center.lon };
  return null;
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
  const alreadyFetched = new Set([...beaches.map(b => b.community), ...emptyRegions]);

  for (const { iso, name: community, country, level } of REGIONS) {
    if (alreadyFetched.has(community)) {
      log(`${community}: already fetched, skipping`);
      continue;
    }
    log(`${community} (${iso}): querying...`);

    let data;
    try {
      data = await overpass(queryFor(iso, level, country));
    } catch (err) {
      log(`    ${community} FAILED: ${err.message}`);
      continue;
    }

    let kept = 0;
    for (const element of data.elements ?? []) {
      const point = pointOf(element);
      const name = element.tags?.name;
      if (!point || !name) continue;

      beaches.push({
        osmType: element.type,
        osmId: element.id,
        name,
        community,
        country,
        lat: Number(point.lat.toFixed(5)),
        lon: Number(point.lon.toFixed(5)),
        feature: element.tags.natural ?? 'beach',
      });
      kept++;
    }

    log(`${community}: ${kept} beaches (running total ${beaches.length})`);
    if (kept === 0) {
      log(`    ${community} returned nothing -- recorded so RESUME skips it`);
      emptyRegions.add(community);
      await writeFile(EMPTY_PATH, JSON.stringify([...emptyRegions], null, 1) + '\n');
    }

    // Save as we go: a failure late in the list must not discard the rest.
    await writeFile(OUT_PATH, JSON.stringify(beaches, null, 1) + '\n');
    await sleep(4000); // be a good Overpass citizen
  }

  log(`DONE. ${beaches.length} named beaches -> ${OUT_PATH.pathname}`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
