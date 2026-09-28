#!/usr/bin/env node
/**
 * Stage 3.5b: publish the surf-forecast breaks no OpenStreetMap place answered to.
 *
 * The catalogue lists every break surf-forecast lists. Stage 3.5 resolves each
 * one against OSM first, and where it finds the place -- a beach, headland or
 * village under that name -- the coordinate stays OSM's. What is left are the
 * breaks OSM has never mapped under their name: reef and peak nicknames (El
 * Quemao, Shooting Gallery, Pico de la Autopista), and peaks on a beach another
 * of their breaks already holds (El Lloret and La Cicer on Las Canteras). Those
 * are published here at the coordinate surf-forecast's own page prints, under
 * the name it uses, with the page recorded in the provenance.
 *
 * Each one still has to pass what every other spot passes: a swell window from
 * the same bathymetry rule as stage 2, wave-model data at the point (stage 3)
 * and, after this stage, the shore check (stage 3.6).
 *
 * The references in .cache/benchmark/ are read by hand, once; do not automate
 * their extraction. Run after stage 3.5, then run stage 3.6 again:
 *
 *   node scripts/attest-surf-spots.mjs
 *   node scripts/add-reference-breaks.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { Bathymetry } from './lib/bathymetry.mjs';
import { probePoints, analyse, slugify, IDEAL_HEIGHT } from './lib/exposure.mjs';
import { nextUtcHour, waveHeights } from './lib/marine.mjs';
import { overpass } from './lib/overpass.mjs';
import { ceremonialCountiesOf } from './lib/communities.mjs';
import { FORECAST_REGIONS, FULL_LIST_COUNTRIES, normalise, namesAgree, distanceKm } from './lib/references.mjs';

const SPOTS = new URL('../src/data/spots.json', import.meta.url);
const INDEX = new URL('../src/data/spots.index.json', import.meta.url);
const ATTESTED = new URL('../src/data/surf-spots.attested.json', import.meta.url);
const CHECK = new URL('../src/data/spots.coordinate-check.json', import.meta.url);
const ATTESTATION_REPORT = new URL('../.cache/benchmark/attestation-report.json', import.meta.url);
const REPORT = new URL('../.cache/benchmark/reference-breaks-report.json', import.meta.url);
const COUNTY_CACHE = new URL('../.cache/english-counties.json', import.meta.url);

/**
 * An attested place this close with a name that agrees is the same break
 * already published; a second marker would only list it twice.
 */
const TWIN_KM = 1.5;

const BATCH = 50;
const PAUSE_MS = 4000;

const fromReference = s => s.provenance?.source === 'surf-forecast';

const spots = JSON.parse(readFileSync(SPOTS));
const attestedFile = JSON.parse(readFileSync(ATTESTED));
const report = JSON.parse(readFileSync(ATTESTATION_REPORT));
const check = existsSync(CHECK) ? JSON.parse(readFileSync(CHECK)).spots : {};
if (!report.forecastBreaks) {
  console.error('The attestation report has no forecastBreaks: run scripts/attest-surf-spots.mjs first.');
  process.exit(1);
}

// Every run recomputes all of them, so re-running stage 3.5 never loses one.
const inScope = country => FULL_LIST_COUNTRIES.includes(country);

// Everything OSM resolved; this stage's own output is rebuilt from scratch.
const base = spots.filter(s => !fromReference(s));
const baseAttested = attestedFile.spots.filter(a => a.coordinate !== 'surf-forecast');
const attestedById = new Map(baseAttested.map(a => [a.id, a]));

const byId = new Map(base.map(s => [s.id, s]));
const attestedIds = new Set(baseAttested.map(a => a.id));
/** A place stage 4 will publish, as far as this stage can tell. */
const published = id => attestedIds.has(id) && byId.has(id) && check[id]?.ok !== false;
const countryOfCommunity = new Map(base.map(s => [s.community, s.country]));
const separated = new Set((report.secondBreaks ?? []).map(b => `${b.region}|${b.reference}`));

const skipped = [];
const candidates = [];
for (const b of report.forecastBreaks) {
  const ours = FORECAST_REGIONS[b.region];
  if (!ours) continue; // a coast this catalogue does not cover
  // Their Ireland page carries Antrim and Londonderry, which are ours in the UK.
  if (!inScope(countryOfCommunity.get(ours[0]) ?? b.country)) continue;
  if (b.placeId && published(b.placeId)) continue;
  if (b.lat === null) {
    skipped.push({ ...b, reason: 'no coordinate read from its page' });
    continue;
  }
  const at = { lat: b.lat, lon: b.lon };
  // A break whose name an already-published neighbour carries is that place,
  // unless stage 3.5 separated them on purpose (two of their peaks, one beach).
  if (!separated.has(`${b.region}|${b.name}`)) {
    const keys = [b.name, ...b.name.split(/\s+[-\/]\s+|\s*\(|\)/)].map(normalise).filter(Boolean);
    const agrees = name => keys.some(k => namesAgree(normalise(name), k, true));
    const around = base.filter(s => published(s.id) && distanceKm(at, s.coordinates) <= TWIN_KM);
    const twin = around.find(s => agrees(s.name));
    if (twin) {
      skipped.push({ ...b, reason: `already published as ${twin.name}` });
      continue;
    }
    // Surfline named the place what surf-forecast calls the break (their
    // Mundaka is OSM's Laidatxu): it is that break, at OSM's coordinate, and
    // stage 4 publishes it under surf-forecast's name.
    const known = around.find(s => !attestedById.get(s.id).forecastName && attestedById.get(s.id).attestedAs.some(agrees));
    if (known) {
      const a = attestedById.get(known.id);
      a.forecastName = b.name;
      a.sources = [...new Set([...a.sources, 'surf-forecast'])].sort();
      a.attestedAs = [...new Set([...a.attestedAs, b.name])].sort();
      a.referenceRegion ??= b.region;
      skipped.push({ ...b, reason: `resolved to ${known.name}, which Surfline names the same` });
      continue;
    }
  }
  // Their region is ours when it maps to one; when it straddles several (North
  // East England), the region of the nearest spot among them -- or, in England,
  // the county the point is in (below).
  let community = ours.length === 1 ? ours[0] : null;
  if (!community) {
    const nearest = base
      .filter(s => ours.includes(s.community))
      .sort((x, y) => distanceKm(at, x.coordinates) - distanceKm(at, y.coordinates))[0];
    community = nearest?.community ?? ours[0];
  }
  const country = countryOfCommunity.get(community) ?? b.country;
  candidates.push({ ...b, community, country, lat: b.lat, lon: b.lon, coordinates: at, straddles: ours.length > 1 });
}

// England's counties by boundary: OSM names no beach in Norfolk, Suffolk or
// Northumberland, so the nearest spot put Cromer in Essex and Bamburgh in Tyne
// and Wear.
// Cached by coordinate (not versioned): a boundary does not move between runs.
const english = candidates.filter(c => c.country === 'United Kingdom' && c.straddles);
const countyCache = existsSync(COUNTY_CACHE) ? JSON.parse(readFileSync(COUNTY_CACHE)) : {};
const pointKey = c => `${c.lat},${c.lon}`;
const unknown = english.filter(c => !(pointKey(c) in countyCache));
if (unknown.length) {
  const counties = await ceremonialCountiesOf(unknown, overpass);
  unknown.forEach((c, i) => (countyCache[pointKey(c)] = counties.get(i) ?? null));
  writeFileSync(COUNTY_CACHE, JSON.stringify(countyCache));
}
for (const c of english) if (countyCache[pointKey(c)]) c.community = countyCache[pointKey(c)];

console.log(`${candidates.length} surf-forecast breaks with no OSM place in ${FULL_LIST_COUNTRIES.join(', ')}`);

// --- Swell window, by the rule stage 2 uses -------------------------------
const bathymetry = new Bathymetry(line => console.log(line));
await bathymetry.prepare(candidates.flatMap(probePoints));
const exposed = [];
for (const c of candidates) {
  // One open bearing, whatever the country: the reference already says it is a
  // break (a bay-head beach in Brittany faces its mouth as Lahinch does).
  const result = analyse(c, probePoints(c).map(p => bathymetry.at(p.lat, p.lon)), 1);
  if (result.surfable) exposed.push({ ...c, result });
  else skipped.push({ ...c, reason: result.reason });
}

// --- Wave-model data, as stage 3 checks -----------------------------------
const hour = nextUtcHour();
const withData = [];
for (let i = 0; i < exposed.length; i += BATCH) {
  const batch = exposed.slice(i, i + BATCH);
  const has = await waveHeights(batch, hour);
  batch.forEach((c, k) => (has[k] ? withData.push(c) : skipped.push({ ...c, reason: 'no wave model data at these coordinates' })));
  if (i + BATCH < exposed.length) await sleep(PAUSE_MS);
}

// --- Write ----------------------------------------------------------------
const usedIds = new Set(base.map(s => s.id));
const usedCoords = new Set(base.map(s => `${s.coordinates.lat},${s.coordinates.lon}`));
const retrievedAt = new Date().toISOString().slice(0, 10);
const added = [];
const addedAttested = [];
const addedAt = new Map(); // "lat,lon" -> index in `added`
for (const c of withData) {
  // surf-forecast prints two decimals, so two of its peaks can share a point:
  // El Lloret and La Cicer on Las Canteras. At that precision they are one
  // forecast and one marker, listed under both names.
  const coordKey = `${c.lat},${c.lon}`;
  if (addedAt.has(coordKey)) {
    const k = addedAt.get(coordKey);
    added[k].name = `${added[k].name} / ${c.name}`;
    addedAttested[k].name = added[k].name;
    addedAttested[k].attestedAs.push(c.name);
    added[k].provenance.alsoReference = [...(added[k].provenance.alsoReference ?? []), `https://www.surf-forecast.com/breaks/${c.slug}`];
    continue;
  }
  if (usedCoords.has(coordKey)) {
    skipped.push({ ...c, reason: 'another spot already stands at this coordinate' });
    continue;
  }
  usedCoords.add(coordKey);
  addedAt.set(coordKey, added.length);
  let id = slugify(c.name);
  if (usedIds.has(id)) id = `${id}-${slugify(c.region)}`;
  for (let n = 2; usedIds.has(id); n++) id = `${slugify(c.name)}-${n}`;
  usedIds.add(id);
  const r = c.result;
  added.push({
    id,
    name: c.name,
    community: c.community,
    country: c.country,
    type: 'Break',
    coordinates: { lat: c.lat, lon: c.lon },
    config: {
      swellWindow: r.swellWindow,
      offshoreWindAngle: r.offshoreWindAngle,
      windTolerance: 45,
      idealHeight: IDEAL_HEIGHT,
    },
    provenance: {
      source: 'surf-forecast',
      reference: `https://www.surf-forecast.com/breaks/${c.slug}`,
      referenceRegion: c.region,
      feature: 'break',
      facingDeg: r.facing,
      exposureDeg: r.exposureDeg,
      elevationSource: 'etopo1-erddap-bilinear',
      retrievedAt,
    },
  });
  addedAttested.push({
    id,
    name: c.name,
    country: c.country,
    region: c.community,
    sources: ['surf-forecast'],
    attestedAs: [c.name],
    coordinate: 'surf-forecast',
    referenceRegion: c.region,
    referenceKm: 0,
  });
}

const allSpots = [...base, ...added];
writeFileSync(SPOTS, JSON.stringify(allSpots, null, 1) + '\n');
writeFileSync(
  INDEX,
  JSON.stringify(
    allSpots.map(s => ({ id: s.id, name: s.name, community: s.community, country: s.country, type: s.type, coordinates: s.coordinates }))
  ) + '\n'
);
const allAttested = [...baseAttested, ...addedAttested].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(ATTESTED, `${JSON.stringify({ ...attestedFile, count: allAttested.length, spots: allAttested }, null, 2)}\n`);
writeFileSync(
  REPORT,
  `${JSON.stringify(
    {
      generatedAt: retrievedAt,
      added: added.map(s => ({ id: s.id, name: s.name, region: s.community, country: s.country })),
      skipped: skipped.map(({ country, region, name, slug, lat, lon, reason }) => ({ country, region, name, slug, lat, lon, reason })),
    },
    null,
    2
  )}\n`
);

console.log(`added ${added.length} breaks at surf-forecast's coordinate, ${skipped.length} not added:`);
for (const s of skipped) console.log(`  ${s.country} / ${s.region} / ${s.name}: ${s.reason}`);
console.log(`\nwrote spots.json, surf-spots.attested.json and .cache/benchmark/reference-breaks-report.json`);
console.log('now run scripts/verify-spot-coordinates.mjs, then scripts/curate-spots.mjs');
