/**
 * Compare the published catalogue with Surfline and surf-forecast, region by
 * region: how many spots each lists, how many of theirs we cover, which of
 * theirs we lack, and which of ours neither of them knows.
 *
 * Reference spots are placed in OUR regions by position (the region of the
 * nearest catalogued OSM place), because neither reference is divided the way
 * this catalogue is: Surfline files all of Cornwall under "England", and
 * surf-forecast splits Cornwall in two.
 *
 * Reads the reference files in .cache/benchmark/ (not versioned; see
 * attest-surf-spots.mjs). Writes .cache/benchmark/benchmark.json.
 *
 *   node scripts/benchmark-catalogue.mjs
 *   node scripts/benchmark-catalogue.mjs "Cataluña"   # list one region in full
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const DATA = new URL('../src/data/', import.meta.url);
const CACHE = new URL('../.cache/benchmark/', import.meta.url);

/** A reference spot counts as covered when one of ours is this close. */
const COVERED_KM = 2;

const read = name => JSON.parse(readFileSync(new URL(name, CACHE)));

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const midLat = ((a.lat + b.lat) / 2) * rad;
  return 6371 * Math.sqrt(dLat ** 2 + (Math.cos(midLat) * dLon) ** 2);
}

function index(points) {
  const grid = new Map();
  for (const p of points) {
    const k = `${Math.round(p.lat * 4)}:${Math.round(p.lon * 4)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return (q, km) => {
    let best = null;
    let bestD = km;
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++)
        for (const p of grid.get(`${Math.round(q.lat * 4) + i}:${Math.round(q.lon * 4) + j}`) ?? []) {
          const d = distanceKm(q, p);
          if (d <= bestD) {
            bestD = d;
            best = p;
          }
        }
    return best && { point: best, km: bestD };
  };
}

// --- Load -----------------------------------------------------------------
const places = JSON.parse(readFileSync(new URL('spots.json', DATA))).map(p => ({ ...p.coordinates, region: `${p.country} / ${p.community}` }));
const nearestPlace = index(places);

const published = readdirSync(new URL('spots/', DATA))
  .filter(f => /^[a-z]{2}\.json$/.test(f))
  .flatMap(f => JSON.parse(readFileSync(new URL(`spots/${f}`, DATA))))
  .map(s => ({ ...s.coordinates, name: s.name, region: `${s.country} / ${s.community}` }));
const nearestPublished = index(published);

const references = [];
for (const [country, spots] of Object.entries(read('surfline-spots.json'))) {
  if (['Portugal', 'Isle of Man', 'Gibraltar'].includes(country)) continue;
  for (const s of spots) if (Number.isFinite(s.lat)) references.push({ source: 'surfline', name: s.name, lat: s.lat, lon: s.lon });
}
if (existsSync(new URL('surf-forecast-coords.json', CACHE))) {
  const coords = read('surf-forecast-coords.json');
  const seen = new Set();
  for (const regions of Object.values(read('surf-forecast-breaks.json')))
    for (const [region, breaks] of Object.entries(regions)) {
      if (/Wavefinder|Forecast Every/i.test(region)) continue;
      for (const [name, slug] of breaks) {
        const at = coords[slug];
        if (!Array.isArray(at) || seen.has(slug)) continue;
        seen.add(slug);
        references.push({ source: 'surf-forecast', name, lat: at[0], lon: at[1] });
      }
    }
}

// --- Compare --------------------------------------------------------------
const rows = new Map();
const row = region => {
  if (!rows.has(region))
    rows.set(region, { region, ours: 0, surfline: 0, 'surf-forecast': 0, covered: { surfline: 0, 'surf-forecast': 0 }, missing: [], unreferenced: [] });
  return rows.get(region);
};

for (const s of published) row(s.region).ours++;

const nearestReference = index(references);
for (const s of published) if (!nearestReference(s, COVERED_KM)) row(s.region).unreferenced.push(s.name);

for (const r of references) {
  // Off our coast entirely (Channel Islands, Portugal's border beaches...).
  const home = nearestPlace(r, 10);
  if (!home) continue;
  const target = row(home.point.region);
  target[r.source]++;
  const ours = nearestPublished(r, COVERED_KM);
  if (ours) target.covered[r.source]++;
  else target.missing.push(`${r.name} (${r.source})`);
}

const table = [...rows.values()].sort((a, b) => a.region.localeCompare(b.region, 'es'));
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '  -');

console.log(`${'region'.padEnd(40)} ${'ours'.padStart(5)} ${'SL'.padStart(5)} ${'SF'.padStart(5)}  covSL  covSF  missing  unref`);
for (const r of table)
  console.log(
    `${r.region.padEnd(40)} ${String(r.ours).padStart(5)} ${String(r.surfline).padStart(5)} ${String(r['surf-forecast']).padStart(5)}  ${pct(r.covered.surfline, r.surfline).padStart(5)}  ${pct(r.covered['surf-forecast'], r['surf-forecast']).padStart(5)}  ${String(r.missing.length).padStart(7)}  ${String(r.unreferenced.length).padStart(5)}`
  );
const sum = k => table.reduce((n, r) => n + (typeof k === 'function' ? k(r) : r[k]), 0);
console.log(
  `\nTOTAL ours ${sum('ours')} | Surfline ${sum('surfline')} (covered ${pct(sum(r => r.covered.surfline), sum('surfline'))}) | surf-forecast ${sum('surf-forecast')} (covered ${pct(sum(r => r.covered['surf-forecast']), sum('surf-forecast'))}) | ours with no reference within ${COVERED_KM} km: ${sum(r => r.unreferenced.length)}`
);

const focus = process.argv[2];
if (focus) {
  for (const r of table.filter(r => r.region.includes(focus))) {
    console.log(`\n## ${r.region}\nmissing (${r.missing.length}):\n  ${r.missing.join('\n  ')}\nours with no reference (${r.unreferenced.length}):\n  ${r.unreferenced.join('\n  ')}`);
  }
}

writeFileSync(new URL('benchmark.json', CACHE), `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), coveredKm: COVERED_KM, regions: table }, null, 2)}\n`);
