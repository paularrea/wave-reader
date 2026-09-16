#!/usr/bin/env node
/**
 * Stage 1 of the national catalogue: pull every named beach in Spain's coastal
 * autonomous communities from OpenStreetMap via Overpass.
 *
 * Output is raw OSM data -- no surf judgement is applied here. Stage 2
 * (derive-spot-config.mjs) decides which of these actually face open ocean.
 *
 *   node scripts/fetch-osm-beaches.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const OUT_DIR = new URL('../src/data/', import.meta.url);
const OUT_PATH = new URL('../src/data/osm-beaches.raw.json', import.meta.url);

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const USER_AGENT = 'wave-reader-catalog/1.0 (https://github.com/paularrea/wave-reader)';

/**
 * Spain's coastal autonomous communities, by the name OSM uses at
 * admin_level=4. Inland communities are omitted: they have no coast.
 */
const COMMUNITIES = [
  'Galicia',
  'Principado de Asturias',
  'Cantabria',
  'País Vasco',
  'Catalunya',
  'Comunitat Valenciana',
  'Región de Murcia',
  'Andalucía',
  'Canarias',
  'Illes Balears',
  'Ceuta',
  'Melilla',
];

/** Display name used across the app, keyed by the OSM name. */
const DISPLAY_NAMES = new Map([
  ['Principado de Asturias', 'Asturias'],
  ['País Vasco', 'País Vasco'],
  ['Catalunya', 'Cataluña'],
  ['Comunitat Valenciana', 'Comunidad Valenciana'],
  ['Región de Murcia', 'Murcia'],
  ['Illes Balears', 'Baleares'],
]);

function queryFor(community) {
  return `
[out:json][timeout:300];
area["name"="${community}"]["admin_level"="4"]->.region;
(
  node["natural"="beach"]["name"](area.region);
  way["natural"="beach"]["name"](area.region);
  relation["natural"="beach"]["name"](area.region);
);
out center tags;
`.trim();
}

async function overpass(query, attempt = 0) {
  const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }),
  });

  if (res.status === 429 || res.status === 504) {
    if (attempt >= 5) throw new Error(`Overpass kept returning ${res.status}`);
    const wait = 15_000 * (attempt + 1);
    console.log(`    ${res.status} from Overpass, retrying in ${wait / 1000}s...`);
    await sleep(wait);
    return overpass(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 160)}`);

  return res.json();
}

/** Beaches are nodes, ways or relations; `out center` gives all three a point. */
function pointOf(element) {
  if (typeof element.lat === 'number') return { lat: element.lat, lon: element.lon };
  if (element.center) return { lat: element.center.lat, lon: element.center.lon };
  return null;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const beaches = [];

  for (const community of COMMUNITIES) {
    process.stdout.write(`${community} ... `);
    const data = await overpass(queryFor(community));

    let kept = 0;
    for (const element of data.elements ?? []) {
      const point = pointOf(element);
      const name = element.tags?.name;
      if (!point || !name) continue;

      beaches.push({
        osmType: element.type,
        osmId: element.id,
        name,
        community: DISPLAY_NAMES.get(community) ?? community,
        lat: Number(point.lat.toFixed(5)),
        lon: Number(point.lon.toFixed(5)),
        surface: element.tags.surface ?? null,
      });
      kept++;
    }

    console.log(`${kept} beaches`);
    await sleep(3000); // be a good Overpass citizen
  }

  await writeFile(OUT_PATH, JSON.stringify(beaches, null, 1) + '\n');
  console.log(`\nTotal: ${beaches.length} named beaches -> ${OUT_PATH.pathname}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
