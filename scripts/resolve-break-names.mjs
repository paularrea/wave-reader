#!/usr/bin/env node
/**
 * Stage 1.5: find an OpenStreetMap coordinate for the breaks stage 1 missed.
 *
 * Stage 1 asks OSM "give me every named beach, bay, headland and reef on this
 * coast" and stage 3.5 then checks which of them a surf reference names. That
 * finds a place only when OSM mapped the break as one of those features.
 * Mullaghmore, Rossnowlagh, Strandhill and Easky are not mapped that way: OSM
 * has the village and nothing else on the point where the wave breaks.
 *
 * So this stage turns the question around. It takes the names the references
 * publish and asks OSM for anything of that name near the break, accepting a
 * wider set of features -- a village, an island, a cliff -- and keeps the best
 * one. The reference still contributes ONLY the name; every coordinate written
 * here is an OSM object, recorded with its type and id like any other.
 *
 * The reference coordinate is used to search near and to reject a namesake on
 * the other side of the country. It is never published, exactly as in stage
 * 3.5. Reference files live in .cache/benchmark/ and are not versioned.
 *
 *   node scripts/resolve-break-names.mjs                  # Ireland
 *   ONLY_COUNTRIES=Ireland,Spain node scripts/resolve-break-names.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { overpass, setOverpassLogger } from './lib/overpass.mjs';

const RAW_PATH = new URL('../src/data/osm-beaches.raw.json', import.meta.url);
const REPORT = new URL('../.cache/benchmark/attestation-report.json', import.meta.url);
const OUT_REPORT = new URL('../.cache/benchmark/break-name-resolution.json', import.meta.url);

const LOG_PATH = process.env.CATALOG_LOG;
function log(line) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(stamped);
  if (LOG_PATH) appendFileSync(LOG_PATH, stamped + '\n');
}
setOverpassLogger(log);

/** How far from the reference an OSM object of the same name can still be it. */
const SEARCH_KM = 3;

/**
 * Which OSM features may stand for a break, best first. A beach is a better
 * answer than the village behind it, and the village is better than nothing --
 * for Mullaghmore it is all OSM has. Everything here is a place on the shore;
 * a road or a shop of the same name is not.
 */
const FEATURE_RANK = [
  ['natural', ['beach', 'shingle', 'sand', 'reef', 'cape', 'bay', 'peninsula', 'cliff', 'strait']],
  /**
   * Not islands: a reference named after one ("Achill Island", "Inishturk")
   * resolves to the whole island, whose centroid is a mountain in the middle of
   * it, not a break.
   */
  ['place', ['village', 'town', 'hamlet', 'locality', 'suburb']],
  ['natural', ['water', 'coastline']],
];

/** Words that qualify a break rather than name it, dropped before searching. */
const QUALIFIERS = new Set(
  ('left right north south east west upper lower inner outer main big little reef reefs point ' +
   'beach strand bay head harbour harbor pier rivermouth rivermouths peak peaks bar ' +
   'island islands islet rock rocks cove strandline')
    .split(' ')
);

/**
 * Words too common to identify a place on their own. "White Rocks" reduced to
 * "white" and matched White Shoulder, a mile up the coast. A reference left
 * with only one of these is not searched.
 */
const GENERIC = new Set('white black long big new old sandy silver golden green grey red the'.split(' '));

function normalise(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The part of a reference name worth searching OSM for. "Easky Left" is Easky,
 * "Trá Mór (Sheephaven Bay)" is Trá Mór. A name that is nothing but qualifiers
 * ("The Peak", "Harbour", "The Bar") has no searchable name and is skipped --
 * those are surfers' nicknames, and no amount of querying invents them.
 */
export function searchTerm(name) {
  const base = name.split('(')[0];
  const tokens = normalise(base)
    .split(' ')
    .filter(t => t.length > 2 && !QUALIFIERS.has(t) && t !== 'the');
  const distinctive = tokens.filter(t => !GENERIC.has(t));
  if (distinctive.length === 0) return null;
  // The longest token is the distinctive one: "Ballinknockane", "Mullaghderg".
  return distinctive.sort((a, b) => b.length - a.length)[0];
}

/** Whether an OSM name carries the reference's distinctive word. */
function nameCarries(name, term) {
  if (!name) return false;
  return normalise(name).split(' ').some(t => t === term || (t.length > 4 && term.length > 4 && (t.startsWith(term) || term.startsWith(t))));
}

function distanceKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  return R * Math.sqrt(((b.lat - a.lat) * rad) ** 2 + (Math.cos(((a.lat + b.lat) / 2) * rad) * (b.lon - a.lon) * rad) ** 2);
}

function pointOf(element) {
  if (typeof element.lat === 'number') return { lat: element.lat, lon: element.lon };
  if (element.center) return { lat: element.center.lat, lon: element.center.lon };
  return null;
}

/** Where an element sits in FEATURE_RANK, or -1 when it is not a shore place. */
function rankOf(tags) {
  for (let i = 0; i < FEATURE_RANK.length; i++) {
    const [key, values] = FEATURE_RANK[i];
    if (values.includes(tags[key])) return i;
  }
  return -1;
}

/**
 * Four breaks per round trip. Everything named within 4 km of a dozen breaks is
 * a large response, and reading it aborted mid-body on the public mirrors.
 */
const BATCH = 6;

/**
 * One Overpass round trip for many breaks: a marker, then everything named
 * near that break, filtered by name here rather than in the query. A
 * case-insensitive regex on `name` cannot use Overpass's index, and asking for
 * one timed out on every mirror; asking for all named objects in a 4 km circle
 * answers in seconds.
 */
async function search(batch) {
  const statements = batch
    .map(
      (b, i) =>
        `make marker idx="${i}"; out; ` +
        `nwr(around:${SEARCH_KM * 1000},${b.lat},${b.lon})["name"]; out center tags;`
    )
    .join('\n');

  const data = await overpass(`[out:json][timeout:240];\n${statements}`);
  const hits = batch.map(() => []);
  let current = -1;
  for (const element of data.elements ?? []) {
    if (element.type === 'marker') {
      current = Number(element.tags?.idx);
      continue;
    }
    if (current >= 0) hits[current].push(element);
  }
  return hits;
}

async function main() {
  if (!existsSync(REPORT)) {
    console.error('.cache/benchmark/attestation-report.json missing: run stage 3.5 first.');
    process.exit(1);
  }
  const countries = new Set(
    (process.env.ONLY_COUNTRIES ?? 'Ireland').split(',').map(c => c.trim()).filter(Boolean)
  );
  const report = JSON.parse(await readFile(REPORT, 'utf8'));
  const raw = JSON.parse(await readFile(RAW_PATH, 'utf8'));
  const known = new Set(raw.map(b => `${b.osmType}/${b.osmId}`));

  /** Every reference with a coordinate that stage 3.5 could not resolve. */
  const unresolved = [];
  const seen = new Set();
  for (const entry of [...report.unconfirmed, ...report.misses.surfline, ...report.misses['surf-forecast']]) {
    const name = entry.reference ?? entry.name;
    const country = entry.country;
    if (!countries.has(country) || !Number.isFinite(entry.lat)) continue;
    const key = `${country}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const term = searchTerm(name);
    if (!term) continue;
    unresolved.push({ name, country, term, lat: entry.lat, lon: entry.lon });
  }

  log(`${unresolved.length} unresolved references with a searchable name`);

  const found = [];
  const nothing = [];
  for (let start = 0; start < unresolved.length; start += BATCH) {
    const batch = unresolved.slice(start, start + BATCH);
    let hits;
    for (let attempt = 0; ; attempt++) {
      try {
        hits = await search(batch);
        break;
      } catch (err) {
        if (attempt >= 4) {
          log(`  giving up on ${batch.map(b => b.name).join(', ')}: ${err.message}`);
          hits = batch.map(() => []);
          break;
        }
        log(`  ${err.message}; retrying in 20s`);
        await sleep(20_000);
      }
    }
    batch.forEach((ref, i) => {
      const candidates = hits[i]
        .filter(element => nameCarries(element.tags?.name, ref.term) || nameCarries(element.tags?.['name:en'], ref.term))
        .map(element => ({ element, point: pointOf(element), rank: rankOf(element.tags ?? {}) }))
        .filter(c => c.point && c.rank >= 0)
        .map(c => ({ ...c, km: distanceKm(ref, c.point) }))
        .filter(c => c.km <= SEARCH_KM)
        .sort((a, b) => a.rank - b.rank || a.km - b.km);

      const best = candidates[0];
      if (!best) {
        nothing.push(ref.name);
        return;
      }
      found.push({
        reference: ref.name,
        country: ref.country,
        osmType: best.element.type,
        osmId: best.element.id,
        name: best.element.tags.name,
        nameEn: best.element.tags['name:en'],
        feature: best.element.tags.natural ?? best.element.tags.place,
        lat: Number(best.point.lat.toFixed(5)),
        lon: Number(best.point.lon.toFixed(5)),
        km: Number(best.km.toFixed(2)),
        alreadyInCatalogue: known.has(`${best.element.type}/${best.element.id}`),
      });
    });
    log(`  searched ${Math.min(start + BATCH, unresolved.length)}/${unresolved.length}`);
    await sleep(4000);
  }

  const additions = found.filter(f => !f.alreadyInCatalogue);
  log(`${found.length} references resolved to an OSM object, ${additions.length} new to the raw file`);
  log(`${nothing.length} found nothing in OSM: ${nothing.join(', ')}`);

  /** The county each new place belongs to, from Nominatim, as in stage 1. */
  const byId = new Map();
  for (const a of additions) byId.set(`${a.osmType[0].toUpperCase()}${a.osmId}`, a);
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/lookup?osm_ids=${chunk.join(',')}&format=json&addressdetails=1`,
        { headers: { 'User-Agent': 'wave-reader-catalog/1.0 (https://github.com/paularrea/wave-reader)' } }
      );
      if (res.ok) {
        for (const place of await res.json()) {
          const entry = byId.get(`${place.osm_type[0].toUpperCase()}${place.osm_id}`);
          if (entry) entry.county = place.address?.county?.replace(/^County /, '');
        }
      }
    } catch (err) {
      log(`  Nominatim failed (${err.message})`);
    }
    await sleep(1100);
  }

  /**
   * Only a place Nominatim puts in a region this catalogue already has is
   * kept. No nearest-neighbour fallback here: surf-forecast files Northern
   * Ireland under Ireland, and the fallback filed Bangor and Newcastle, both in
   * County Down, under Louth across the sea.
   */
  const regions = new Set(raw.filter(b => b.country === 'Ireland' || countries.has(b.country)).map(b => b.community));
  const foreign = additions.filter(a => a.county && !regions.has(a.county));
  if (foreign.length) log(`${foreign.length} resolved outside the regions covered: ${foreign.map(a => `${a.reference} (${a.county})`).join(', ')}`);

  const rows = additions
    .filter(a => a.county && regions.has(a.county))
    .map(a => ({
      osmType: a.osmType,
      osmId: a.osmId,
      name: a.name,
      community: a.county,
      country: a.country,
      lat: a.lat,
      lon: a.lon,
      feature: a.feature,
      ...(a.nameEn && a.nameEn !== a.name ? { nameEn: a.nameEn } : {}),
      resolvedFrom: a.reference,
    }));

  await writeFile(RAW_PATH, JSON.stringify([...raw, ...rows], null, 1) + '\n');
  await writeFile(
    OUT_REPORT,
    JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), found, nothing }, null, 2) + '\n'
  );
  log(`added ${rows.length} places to the raw file; report in .cache/benchmark/break-name-resolution.json`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
