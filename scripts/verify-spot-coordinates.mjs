/**
 * Stage 3.6: check that every attested spot's coordinate is where a surfer
 * would stand -- on the open-sea shore -- before stage 4 publishes it.
 *
 * Attestation (stage 3.5) says a place is a break. It does not say OSM put the
 * point in the right place: a beach polygon's centroid can fall in a car park,
 * and a lagoon shore sits a few hundred metres from the sea it is separated
 * from. The Mar Menor is the case that prompted this: its beaches face a
 * five-metre-deep lagoon that never sees swell, and La Manga's sea-side beaches
 * are on the same strip of sand.
 *
 * Three checks per coordinate, all against OpenStreetMap:
 *
 *   1. OSM's natural=coastline runs within COAST_M of the point.
 *   2. The shore nearest the point is not the shore of enclosed water. OSM
 *      draws natural=coastline around anything tidal, so the Mar Menor, the
 *      Etang de Thau and the Ebro delta bays all have "coastline" too -- the
 *      coastline check alone passed every lagoon beach tested. Enclosed water
 *      is recognised by its own feature: a lake, lagoon or pond, or a bay named
 *      as one of the enclosed seas in ENCLOSED.
 *   3. Where a surf reference gave its own coordinate, it is within
 *      REFERENCE_KM. Further than that and the name matched a different beach.
 *
 * A long beach fails check 1 honestly: OSM stores the centroid of its polygon,
 * and for Pendine's eleven kilometres or La Barrosa's dunes that centroid is
 * half a kilometre inland. Those points are moved to the nearest point of the
 * sea coastline -- still OSM geometry, now where the water is -- as long as
 * that is within SNAP_M, and the move is recorded.
 *
 * The result is committed (src/data/spots.coordinate-check.json) so stage 4
 * stays offline and the reason for every rejection can be read.
 *
 *   node scripts/verify-spot-coordinates.mjs            # check what is new or moved
 *   FULL=1 node scripts/verify-spot-coordinates.mjs     # re-check everything
 *   ONLY=id,id node scripts/verify-spot-coordinates.mjs # just these (writes only them)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { overpass } from './lib/overpass.mjs';

const SPOTS = new URL('../src/data/spots.json', import.meta.url);
const ATTESTED = new URL('../src/data/surf-spots.attested.json', import.meta.url);
const OUT = new URL('../src/data/spots.coordinate-check.json', import.meta.url);

/**
 * OSM beaches are polygons and the catalogue stores their centroid, which on a
 * wide beach backed by dunes sits a couple of hundred metres from the water.
 */
const COAST_M = 350;

/** How far to look for inland water that might be the real shore. */
const WATER_M = 500;

/**
 * Water bodies OSM tags as a bay but that are closed seas: no swell reaches
 * them. A beach whose nearest shore is one of these faces the lagoon, however
 * close the open sea is on the other side of the sandbar.
 */
const ENCLOSED = 'Mar Menor|[ÉE]tang|Estany|Albufera|Bassin d.Arcachon|Badia dels Alfacs|Badia del Fangar|Golfe du Morbihan|Rade de Brest|Laguna';

/** A centroid is moved to the shoreline at most this far. */
const SNAP_M = 2500;

/** Two shores closer than this to each other are the same shore. */
const SAME_SHORE_M = 60;

/** Past this, the reference and OSM are describing different beaches. */
const REFERENCE_KM = 5;

const BATCH = 30;

/** Enclosed waters, fetched once per region and measured locally. Not versioned. */
const ENCLOSED_CACHE = new URL('../.cache/enclosed-waters-by-zone.json', import.meta.url);

// --- Geometry -------------------------------------------------------------
/** Metres from `p` to the segment a-b, on a local flat projection. */
function segmentDistanceM(p, a, b) {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110_540;
  const ax = (a.lon - p.lon) * kx;
  const ay = (a.lat - p.lat) * ky;
  const bx = (b.lon - p.lon) * kx;
  const by = (b.lat - p.lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Nearest distance from `p` to any line in an Overpass `out geom` element. */
function elementDistanceM(p, el) {
  const lines = el.lines ?? (el.geometry ? [el.geometry] : (el.members ?? []).map(m => m.geometry).filter(Boolean));
  let best = Infinity;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      if (!line[i - 1] || !line[i]) continue;
      best = Math.min(best, segmentDistanceM(p, line[i - 1], line[i]));
    }
  }
  return best;
}

/** The point of `lines` nearest to `p`, with its distance in metres. */
function nearestPoint(p, lines) {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110_540;
  let best = { m: Infinity, lat: null, lon: null };
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if (!a || !b) continue;
      const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky;
      const dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * ky;
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
      const m = Math.hypot(ax + t * dx, ay + t * dy);
      if (m < best.m) best = { m, lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
    }
  return best;
}

// --- Query ----------------------------------------------------------------
function bbox({ lat, lon }, metres) {
  const dLat = metres / 110_540;
  const dLon = metres / (111_320 * Math.cos((lat * Math.PI) / 180));
  return `${(lat - dLat).toFixed(5)},${(lon - dLon).toFixed(5)},${(lat + dLat).toFixed(5)},${(lon + dLon).toFixed(5)}`;
}

/**
 * One query for a batch: the coastline near each spot, preceded by a `make`
 * marker so the flat element list can be split back per spot. Geometry is
 * clipped to a small box, because a coastline way can run for hundreds of
 * kilometres.
 */
function queryFor(batch) {
  const parts = batch.map(({ coordinates: c }, k) => {
    const box = bbox(c, WATER_M * 1.5);
    return `make marker spot="${k}";out;\nway["natural"="coastline"](around:${WATER_M},${c.lat},${c.lon});out geom(${box});`;
  });
  return `[out:json][timeout:180];\n${parts.join('\n')}`;
}

/**
 * Where the closed seas are. Searching every coast for them by name took
 * Overpass twenty minutes a region; these boxes are the only stretches of the
 * catalogue's coast with a lagoon, étang or enclosed bay beside the beaches,
 * and only spots inside one are measured against it. Add a box before adding
 * a coast that has one.
 */
const LAGOON_ZONES = {
  'Mar Menor': [37.6, -0.9, 37.84, -0.7],
  'Albufera de València': [39.25, -0.42, 39.4, -0.28],
  "Delta de l'Ebre": [40.55, 0.55, 40.8, 0.95],
  "Albufera d'Alcúdia": [39.75, 3.05, 39.9, 3.2],
  'Étangs du Roussillon et de la Narbonnaise': [42.7, 2.95, 43.2, 3.2],
  'Étang de Thau': [43.33, 3.5, 43.48, 3.75],
  'Étangs palavasiens': [43.45, 3.8, 43.62, 4.15],
  'Camargue et Étang de Berre': [43.3, 4.3, 43.6, 5.25],
  'Étangs de Corse orientale': [41.9, 9.35, 42.7, 9.6],
  "Bassin d'Arcachon": [44.55, -1.3, 44.78, -1.0],
  'Golfe du Morbihan': [47.5, -3.0, 47.65, -2.65],
  'Rade de Brest': [48.25, -4.6, 48.45, -4.25],
};

const zoneOf = ({ lat, lon }) =>
  Object.keys(LAGOON_ZONES).find(z => {
    const [s, w, n, e] = LAGOON_ZONES[z];
    return lat >= s && lat <= n && lon >= w && lon <= e;
  }) ?? null;

/** The enclosed waters of every zone that holds a spot, fetched once and cached. */
async function enclosedWaters(spots) {
  const cache = existsSync(ENCLOSED_CACHE) ? JSON.parse(readFileSync(ENCLOSED_CACHE)) : {};
  const zones = new Set(spots.map(s => zoneOf(s.coordinates)).filter(Boolean));
  for (const zone of zones) {
    if (cache[zone]) continue;
    const box = LAGOON_ZONES[zone].join(',');
    const data = await overpass(
      `[out:json][timeout:180];(way["natural"="bay"](${box});rel["natural"="bay"](${box});` +
        `way["natural"="water"]["water"~"^(lagoon|pond|lake)$"](${box});rel["natural"="water"]["water"~"^(lagoon|pond|lake)$"](${box}););out geom;`
    );
    cache[zone] = (data.elements ?? [])
      .filter(el => new RegExp(ENCLOSED, 'i').test(el.tags?.name ?? '') || el.tags?.water === 'lagoon')
      .map(el => ({
        name: el.tags?.name ?? null,
        lines: el.geometry ? [el.geometry] : (el.members ?? []).map(m => m.geometry).filter(Boolean),
      }));
    writeFileSync(ENCLOSED_CACHE, JSON.stringify(cache));
    console.log(`  enclosed waters, ${zone}: ${cache[zone].map(w => w.name).join(', ') || 'none'}`);
    await sleep(2000);
  }
  return cache;
}

function split(elements) {
  const out = [];
  let current = null;
  for (const el of elements) {
    if (el.type === 'marker') {
      const k = Number(el.tags.spot);
      out[k] ??= { coast: [] };
      current = out[k].coast;
      continue;
    }
    current?.push(el);
  }
  return out;
}

// --- Run ------------------------------------------------------------------
const places = new Map(JSON.parse(readFileSync(SPOTS)).map(p => [p.id, p]));
const attested = JSON.parse(readFileSync(ATTESTED)).spots;
const previous = existsSync(OUT) && !process.env.FULL ? JSON.parse(readFileSync(OUT)).spots : {};

const results = {};
const todo = [];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const checked = [];
for (const a of attested) {
  if (only && !only.has(a.id)) continue;
  const p = places.get(a.id);
  if (!p) continue;
  checked.push({ ...p, attestation: a });
  const prior = previous[a.id];
  if (!(prior && prior.lat === p.coordinates.lat && prior.lon === p.coordinates.lon && prior.coastM !== undefined)) todo.push(checked.at(-1));
}

console.log(`${attested.length} attested spots, ${todo.length} coastlines to fetch`);
const waters = await enclosedWaters(checked);

/** The shore nearest the spot, if it is enclosed water. Local, so re-run every time. */
function nearestEnclosed(spot) {
  let best = { m: Infinity, name: null };
  for (const w of waters[zoneOf(spot.coordinates)] ?? []) {
    const m = elementDistanceM(spot.coordinates, w);
    if (m < best.m) best = { m, name: w.name };
  }
  return Number.isFinite(best.m) && best.m <= WATER_M ? { waterM: Math.round(best.m), waterName: best.name } : { waterM: null, waterName: null };
}

function judge(r, a) {
  const verdict = reason => ({ ok: reason === null, reason, referenceKm: a.referenceKm });
  if (r.coastM === null) return verdict(`no sea coastline within ${WATER_M} m`);
  if (r.coastM > COAST_M) return verdict(`${r.coastM} m from the sea coastline`);
  if (r.waterM !== null && r.waterM <= r.coastM + SAME_SHORE_M)
    return verdict(`its shore is enclosed water${r.waterName ? ` (${r.waterName})` : ''}, not the open sea`);
  if (a.referenceKm !== null && a.referenceKm > REFERENCE_KM) return verdict(`the reference puts this break ${a.referenceKm} km away`);
  return verdict(null);
}

function record(spot, coastM) {
  const r = { lat: spot.coordinates.lat, lon: spot.coordinates.lon, coastM, ...nearestEnclosed(spot) };
  results[spot.id] = { ...r, ...judge(r, spot.attestation) };
}

for (const spot of checked) {
  const prior = previous[spot.id];
  if (todo.includes(spot)) continue;
  if (prior.snapped) {
    const moved = { ...spot, coordinates: { lat: prior.snapped.lat, lon: prior.snapped.lon } };
    const r = { lat: prior.lat, lon: prior.lon, coastM: 0, ...nearestEnclosed(moved) };
    results[spot.id] = { ...r, ...judge(r, spot.attestation), snapped: prior.snapped };
  } else record(spot, prior.coastM);
}

function save() {
  const sorted = Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b)));
  const ok = Object.values(sorted).filter(r => r.ok).length;
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        rules: { coastM: COAST_M, snapM: SNAP_M, waterSearchM: WATER_M, sameShoreM: SAME_SHORE_M, enclosed: ENCLOSED, referenceKm: REFERENCE_KM },
        checked: Object.keys(sorted).length,
        ok,
        spots: sorted,
      },
      null,
      1
    )}\n`
  );
  return ok;
}

for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const data = await overpass(queryFor(batch));
  const perSpot = split(data.elements ?? []);
  batch.forEach((spot, k) => {
    const coast = Math.min(...(perSpot[k]?.coast ?? []).map(el => elementDistanceM(spot.coordinates, el)));
    record(spot, Number.isFinite(coast) ? Math.round(coast) : null);
  });
  save();
  console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  await sleep(2000);
}

// --- Long beaches: move the centroid to the shoreline ----------------------
const offShore = checked.filter(
  s => !results[s.id].ok && (results[s.id].coastM === null || results[s.id].coastM > COAST_M) && !results[s.id].snapped
);
for (const spot of offShore) {
  const c = spot.coordinates;
  const data = await overpass(
    `[out:json][timeout:120];way["natural"="coastline"](around:${SNAP_M},${c.lat},${c.lon});out geom(${bbox(c, SNAP_M * 1.2)});`
  );
  const lines = (data.elements ?? []).map(el => el.geometry).filter(Boolean);
  const shore = nearestPoint(c, lines);
  if (!Number.isFinite(shore.m) || shore.m > SNAP_M) continue;
  const moved = { ...spot, coordinates: { lat: Number(shore.lat.toFixed(5)), lon: Number(shore.lon.toFixed(5)) } };
  const r = { lat: c.lat, lon: c.lon, coastM: 0, ...nearestEnclosed(moved) };
  const verdict = judge(r, spot.attestation);
  results[spot.id] = { ...r, ...verdict, snapped: { ...moved.coordinates, movedM: Math.round(shore.m) } };
  console.log(`  ${spot.id}: moved ${Math.round(shore.m)} m to the shoreline${verdict.ok ? '' : ` -- still rejected: ${verdict.reason}`}`);
  save();
  await sleep(2000);
}

const ok = save();
const rejected = Object.entries(results).filter(([, r]) => !r.ok);
console.log(`\n${ok} coordinates verified, ${rejected.length} rejected:`);
for (const [id, r] of rejected) console.log(`  ${id.padEnd(40)} ${r.reason}`);
