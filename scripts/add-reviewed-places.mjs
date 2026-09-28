#!/usr/bin/env node
/**
 * Stage 1.6: put the OSM objects that reviewed decisions name into the raw file.
 *
 * src/data/surf-spots.reviewed.json records, for a break the automatic rules
 * could not resolve, which OSM object it is -- checked by a person against the
 * map. Often that object is already in the raw file. When it is not -- a
 * headland stage 1 does not fetch in that country, a beach whose polygon the
 * fetch missed -- this stage asks Overpass for exactly that object and adds it,
 * with the region Nominatim gives it. Nothing is added that a decision does not
 * name, and every coordinate is still OSM's.
 *
 *   node scripts/add-reviewed-places.mjs
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { overpass, setOverpassLogger } from './lib/overpass.mjs';
import { addressesOf, regionOfAddress } from './lib/communities.mjs';

const RAW_PATH = new URL('../src/data/osm-beaches.raw.json', import.meta.url);
const REVIEWED = new URL('../src/data/surf-spots.reviewed.json', import.meta.url);

const LOG_PATH = process.env.CATALOG_LOG;
function log(line) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(stamped);
  if (LOG_PATH) appendFileSync(LOG_PATH, stamped + '\n');
}
setOverpassLogger(log);

/** The feature a stage-2 place records, which the spot detail turns into Beach, Point, Reef or Break. */
function featureOf(tags) {
  if (tags.natural) return tags.natural;
  if (tags.place) return tags.place;
  if (tags.leisure === 'beach_resort') return 'beach';
  return 'locality';
}

async function main() {
  const raw = JSON.parse(readFileSync(RAW_PATH));
  const reviewed = JSON.parse(readFileSync(REVIEWED));
  const known = new Set(raw.map(b => `${b.osmType}/${b.osmId}`));

  const wanted = new Map(); // "way/123" -> { country, reference }
  for (const [country, list] of Object.entries(reviewed)) {
    if (country.startsWith('_')) continue;
    for (const d of list) if (d.osm && !known.has(d.osm) && !wanted.has(d.osm)) wanted.set(d.osm, { country, reference: d.reference });
  }
  log(`${wanted.size} reviewed OSM objects not yet in the raw file`);
  if (wanted.size === 0) return;

  const ids = { node: [], way: [], relation: [] };
  for (const key of wanted.keys()) {
    const [type, id] = key.split('/');
    ids[type].push(id);
  }
  const query = `[out:json][timeout:120];(${Object.entries(ids)
    .filter(([, list]) => list.length)
    .map(([type, list]) => `${type}(id:${list.join(',')});`)
    .join('')});out center tags;`;
  const data = await overpass(query);

  const rows = [];
  for (const el of data.elements ?? []) {
    const key = `${el.type}/${el.id}`;
    const want = wanted.get(key);
    const point = typeof el.lat === 'number' ? { lat: el.lat, lon: el.lon } : el.center;
    if (!want || !point || !el.tags?.name) continue;
    rows.push({
      osmType: el.type,
      osmId: el.id,
      name: el.tags.name,
      community: null,
      country: want.country,
      lat: Number(point.lat.toFixed(5)),
      lon: Number(point.lon.toFixed(5)),
      feature: featureOf(el.tags),
      ...(want.country === 'Ireland' && el.tags['name:en'] && el.tags['name:en'] !== el.tags.name ? { nameEn: el.tags['name:en'] } : {}),
      resolvedFrom: want.reference,
      reviewed: true,
    });
  }
  const missing = [...wanted.keys()].filter(k => !rows.some(r => `${r.osmType}/${r.osmId}` === k));
  if (missing.length) log(`not found in OSM (deleted or unnamed?): ${missing.join(', ')}`);

  const addresses = await addressesOf(rows, log);
  for (const row of rows) {
    row.community = regionOfAddress(addresses.get(`${row.osmType[0].toUpperCase()}${row.osmId}`), row.country);
    if (row.community) continue;
    // On the waterline, outside every polygon: the region of the nearest place.
    let best = null;
    for (const other of raw) {
      if (other.country !== row.country) continue;
      const d = (other.lat - row.lat) ** 2 + ((other.lon - row.lon) * Math.cos((row.lat * Math.PI) / 180)) ** 2;
      if (!best || d < best.d) best = { d, community: other.community };
    }
    row.community = best?.community ?? null;
  }
  const placed = rows.filter(r => r.community);
  for (const r of rows.filter(r => !r.community)) log(`  no region for ${r.name} (${r.osmType}/${r.osmId})`);

  writeFileSync(RAW_PATH, JSON.stringify([...raw, ...placed], null, 1) + '\n');
  log(`added ${placed.length} reviewed places: ${placed.map(r => `${r.name} [${r.community}]`).join(', ')}`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
