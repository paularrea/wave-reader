/**
 * Stage 3.5: decide which of the catalogued OSM places are actually surf spots.
 *
 * Stage 2 answers a question about geometry -- does swell reach this shore --
 * and stage 4 used to publish anything that passed it. That is why 1,690 places
 * shipped where surf-forecast lists a few hundred: an exposed beach and a surf
 * spot are not the same claim, and no amount of bathymetry turns one into the
 * other. "People surf here" is attested, not derived.
 *
 * So this stage resolves published surf-break references against the OSM
 * catalogue. Each reference contributes NAMES; the coordinates, the swell
 * window and every other config value keep coming from OpenStreetMap, which is
 * the only source this catalogue redistributes.
 *
 * Reference files live in .cache/benchmark/ and are NOT versioned. Rebuilding
 * them is a manual, one-off read of public pages -- do not automate it on a
 * schedule. See CLAUDE.md, "Puertos del Estado -- investigated, not integrated"
 * for why this project is careful about third-party data.
 *
 *   node scripts/attest-surf-spots.mjs
 *   node scripts/attest-surf-spots.mjs --report   # print the misses too
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { curatedMatch } from './lib/curated.mjs';

const SPOTS = new URL('../src/data/spots.json', import.meta.url);
const SURFLINE = new URL('../.cache/benchmark/surfline-spots.json', import.meta.url);
const FORECAST = new URL('../.cache/benchmark/surf-forecast-breaks.json', import.meta.url);
/** Per break, the coordinate its surf-forecast page prints: { slug: [lat, lon] }. */
const FORECAST_COORDS = new URL('../.cache/benchmark/surf-forecast-coords.json', import.meta.url);
const OUT = new URL('../src/data/surf-spots.attested.json', import.meta.url);
const REPORT = new URL('../.cache/benchmark/attestation-report.json', import.meta.url);

/**
 * How close a reference's own coordinate has to be to an OSM place before the
 * two can be the same break. Surf references point at the peak, OSM at the
 * centroid of the beach polygon, so a long beach puts a kilometre between them
 * honestly. Past 2 km they are neighbours, not the same place.
 */
const SAME_BREAK_KM = 2;

/**
 * Close enough that the reference's coordinate vouches for a looser name:
 * "Bude Crooklets" 20 m from an OSM place called Crooklets Beach is that beach.
 */
const ANCHORED_KM = 1;

/** surf-forecast prints coordinates to two decimals: up to ~600 m of rounding. */
const FORECAST_ROUNDING_KM = 0.6;

/** Two places attested by the same name this close together are one break. */
const ONE_BREAK_KM = 2;

/** Name matches closer than this need nothing else. */
const NEAR_NAME_KM = 3;

/** A reference point within this of a mapped beach is standing on that beach. */
const OWN_SAND_KM = 1;

/** With a name in common, the two can be further apart and still be one place. */
const SAME_NAME_KM = 6;

const COUNTRY_OF = {
  Spain: 'Spain',
  'Spain-1': 'Spain', // surf-forecast files the Canaries under Spain (Africa)
  France: 'France',
  'United-Kingdom': 'United Kingdom',
  Ireland: 'Ireland',
  Guadeloupe: 'France',
  Martinique: 'France',
  Reunion: 'France',
  'French-Guiana': 'France',
  'United Kingdom': 'United Kingdom',
  'Réunion': 'France',
  Gibraltar: null,
  Portugal: null,
  'Isle of Man': null,
};


/**
 * surf-forecast groups breaks by surfing region -- "Gower", "La Cote Basque",
 * "North East England" -- which is not how this catalogue is divided. Without
 * the hint, a name on its own is ambiguous up and down a coast: "Santa Marina"
 * is a beach in Asturias and another in Galicia, and refusing to guess threw
 * away a match the reference had already disambiguated.
 *
 * A reference region maps to the set of our regions it can mean. Several of
 * theirs straddle ours, so the set narrows the candidates without pretending to
 * pick between them; a name still has to resolve to exactly one place.
 * Regions mapped to null are coasts this catalogue does not cover.
 */
const FORECAST_REGIONS = {
  // Spain
  Andalucia: ['Andalucía'],
  Asturias: ['Asturias'],
  'Balearic Islands (Islas Baleares)': ['Baleares'],
  Catalunia: ['Cataluña'],
  Galicia: ['Galicia'],
  Murcia: ['Murcia'],
  'Pais Vasco': ['País Vasco'],
  'Spain - Cantabria': ['Cantabria'],
  Valencia: ['Comunidad Valenciana'],
  Fuerteventura: ['Canarias'],
  'Gran Canaria': ['Canarias'],
  Lanzarote: ['Canarias'],
  Tenerife: ['Canarias'],
  // France
  'Charente Maritime': ['Nouvelle-Aquitaine'],
  Gironde: ['Nouvelle-Aquitaine'],
  Landes: ['Nouvelle-Aquitaine'],
  'La Cote Basque': ['Nouvelle-Aquitaine'],
  Corsica: ['Corse'],
  "Cote d'Armor - Brittany": ['Bretagne'],
  'Finistere - Brittany': ['Bretagne'],
  'Ile et Vilaine - Brittany': ['Bretagne'],
  'Morbihan - Brittany': ['Bretagne'],
  "Cote d'Azur": ["Provence-Alpes-Côte d'Azur"],
  'Languedoc-Roussillon': ['Occitanie'],
  'Loire Atlantique': ['Pays de la Loire'],
  Vendee: ['Pays de la Loire'],
  'Nord - Pas de Calais': ['Hauts-de-France'],
  Normandy: ['Normandie'],
  'Guadeloupe - Grande Terre': ['Guadeloupe'],
  Martinique: ['Martinique'],
  'Réunion Island': ['La Réunion'],
  'French Guiana': ['Guyane'],
  // Ireland -- their country page covers the whole island, so two of their
  // regions belong to our United Kingdom.
  Clare: ['Clare'],
  Cork: ['Cork'],
  Donegal: ['Donegal'],
  Kerry: ['Kerry'],
  'Mayo and Achill Island': ['Mayo'],
  Sligo: ['Sligo'],
  Waterford: ['Waterford'],
  Wexford: ['Wexford'],
  Antrim: ['Northern Ireland'],
  Londonderry: ['Northern Ireland'],
  // United Kingdom
  'North Cornwall': ['Cornwall'],
  'South Cornwall': ['Cornwall'],
  'North Devon': ['Devon'],
  'South Devon': ['Devon'],
  Anglesy: ['Wales'],
  Gower: ['Wales'],
  'Lleyn Peninsula': ['Wales'],
  'Mid Wales': ['Wales'],
  'North Wales': ['Wales'],
  Pembrokeshire: ['Wales'],
  'Inner Hebrides': ['Scotland'],
  'Outer Hebrides': ['Scotland'],
  Kintyre: ['Scotland'],
  'Orkney Islands': ['Scotland'],
  'Scotland - East Coast': ['Scotland'],
  'Scotland - North Coast': ['Scotland'],
  'Isle of Wight': ['Isle of Wight'],
  'North East England': ['Northumberland', 'Tyne and Wear', 'County Durham', 'North Yorkshire', 'East Riding of Yorkshire'],
  'East Anglia': ['Norfolk', 'Suffolk', 'Essex'],
  'South Coast of England': ['Dorset', 'Hampshire', 'East Sussex', 'West Sussex', 'Isle of Wight'],
  'South East': ['Kent', 'East Sussex', 'West Sussex'],
  // Coasts this catalogue does not cover
  Alderney: null,
  Guernsey: null,
  Jersey: null,
  'Isle of Man': null,
  Lincolnshire: null,
};

const STOPWORDS = new Set(
  ('praia playa platja plage plaja beach strand traeth hondartza sands sand bay baie bahia baia cove kala cala caleta anse playas plages ' +
   'de del dels des du da do das dos la le les los el els lo s sa a o of the and y e i der den la')
    .split(' ')
);

function normalise(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .join(' ')
    .trim();
}

function distanceKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const midLat = ((a.lat + b.lat) / 2) * rad;
  return R * Math.sqrt(dLat ** 2 + (Math.cos(midLat) * dLon) ** 2);
}

/**
 * Words a reference adds to say which part of a beach it means. "South Fistral"
 * and "Fistral-North" are both Fistral Beach as far as a place goes.
 */
const QUALIFIERS = new Set(
  'north south east west nord sud norte sur little big main left right centre center central middle'.split(' ')
);

/**
 * Basque place names carry a genitive the surf references drop: Zarautz is
 * mapped as "Zarauzko hondartza", Orio as "Orioko", Deba as "Debako". Only that
 * suffix is forgiven -- a general shared-stem rule let "Carrowmore" stand in
 * for "Carrownisky", two beaches in different bays.
 */
function genitive(t, u) {
  const [short, long] = t.length <= u.length ? [t, u] : [u, t];
  if (short.length < 4 || !long.endsWith('ko')) return false;
  const base = long.replace(/e?ko$/, '');
  return base === short || base === short.replace(/tz$/, 'z');
}

const token = (t, u) => t === u || genitive(t, u);
const covers = (x, y) => x.every(t => y.some(u => token(t, u)));

/**
 * Two names are the same break when every significant token of one appears in
 * the other. `place` is the OSM name, `ref` the reference's.
 *
 * The reference may be the shorter name ("Rodiles" for "Playa de Rodiles"),
 * and may qualify it ("South Fistral"). The OSM name may be the shorter one only
 * when it has two tokens or more, or when `anchored` -- the reference's own
 * coordinate puts it on the same sand. Unanchored, a one-word OSM place is
 * contained in far too many references: "Ness" in Brims Ness, Grim Ness and
 * Point of Ness; "Playa Roja" in "Cruz Roja".
 */
function namesAgree(place, ref, anchored = false) {
  if (!place || !ref) return false;
  if (place === ref) return true;
  const tp = place.split(' ');
  const full = ref.split(' ');
  // A qualifier the place does not carry is dropped ("South Fistral" is Fistral
  // Beach); one it contradicts is not ("Portrush East Strand" is not West Strand).
  const placeQualifiers = tp.filter(t => QUALIFIERS.has(t));
  if (placeQualifiers.some(q => !full.includes(q))) return false;
  const tr = full.filter(t => !QUALIFIERS.has(t) || placeQualifiers.includes(t));
  if (tr.length === 0) return false;
  return covers(tr, tp) || ((tp.length >= 2 || anchored) && covers(tp, full));
}

/** Edit-distance similarity, for spellings that drift: Gwynver / Gwenver, Mendia / Mandia. */
function similarity(a, b) {
  const A = a.replace(/ /g, '');
  const B = b.replace(/ /g, '');
  if (!A || !B) return 0;
  const row = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (A[i - 1] === B[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - row[B.length] / Math.max(A.length, B.length);
}

/**
 * Spelling drift is allowed only between long names and only when the two
 * places are close: at 0.75 similarity "Siouville" became "Trouville" and
 * "Trestel" became "Trestrignel", real beaches kilometres apart.
 */
const spellingDrift = (a, b) => a.replace(/ /g, '').length >= 6 && b.replace(/ /g, '').length >= 6 && similarity(a, b) >= 0.85;

// --- Load ---------------------------------------------------------------
if (!existsSync(SURFLINE) || !existsSync(FORECAST)) {
  console.error('Reference files missing from .cache/benchmark/. They are not versioned;');
  console.error('rebuild them by hand before running this stage.');
  process.exit(1);
}

const places = JSON.parse(readFileSync(SPOTS));
const surfline = JSON.parse(readFileSync(SURFLINE));
const forecast = JSON.parse(readFileSync(FORECAST));
// Optional: without it, surf-forecast names are matched by name inside their
// region only, which leaves town-named breaks ("Laredo", "Mimizan") unresolved.
const forecastCoords = existsSync(FORECAST_COORDS) ? JSON.parse(readFileSync(FORECAST_COORDS)) : {};

for (const p of places) p._key = normalise(p.name);

/** Coarse grid so "every place near this point" is not a full scan. */
const grid = new Map();
const cell = p => `${Math.round(p.lat * 4)}:${Math.round(p.lon * 4)}`;
for (const p of places) {
  const k = cell(p.coordinates);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(p);
}
function near(point, km) {
  const out = [];
  const span = Math.ceil(km / 20) + 1;
  for (let i = -span; i <= span; i++)
    for (let j = -span; j <= span; j++)
      for (const p of grid.get(`${Math.round(point.lat * 4) + i}:${Math.round(point.lon * 4) + j}`) ?? [])
        if (distanceKm(point, p.coordinates) <= km) out.push(p);
  return out;
}

const evidence = new Map(); // place id -> [{source, name}]
function attest(place, source, name, ref = null) {
  if (!evidence.has(place.id)) evidence.set(place.id, []);
  const list = evidence.get(place.id);
  if (!list.some(e => e.source === source && e.name === name)) list.push({ source, name, ref });
}

const misses = { surfline: [], 'surf-forecast': [] };
const unmappedRegions = new Set();

// --- 1. References that carry a coordinate ------------------------------
// A coordinate alone is not enough. Matching each Surfline spot to whatever OSM
// place was nearest attested 274 places, and a quarter of them were the wrong
// sand: Mundaka resolved to "Basamortu kala", Strandhill to Culleenamore across
// the bay, Brighton Marina to a naturist beach. The break was real; the place,
// its name and its coordinate were not. So a coordinate-carrying reference only
// attests a place whose name agrees with it, anywhere within SAME_NAME_KM, and
// the rest go to a review queue rather than into the catalogue.
const unconfirmed = [];

/**
 * Resolve one reference that carries its own coordinate. Returns true when it
 * attested a place. `slackKm` widens the anchored radius for references that
 * round their coordinates (surf-forecast prints two decimals, +/- 600 m).
 */
function resolveAnchored(source, name, point, country, slackKm = 0) {
  const key = normalise(name);
  // "Rodiles - Main Beach", "Paguera - Mallorca": the qualifier is not the break.
  const keys = [key, ...name.split(/\s+[-\/]\s+|\s*\(|\)/).map(normalise)].filter(Boolean);
  const anchored = ANCHORED_KM + slackKm;
  // Past NEAR_NAME_KM a name match is only trusted when the reference's point
  // is not on some other mapped beach: "Playa Finestrat" landed 4 km from Cala
  // de Finestrat while standing on a different beach, where Pendine's point sits
  // mid-sand 4 km from the centroid of a beach that long.
  const onOtherSand = near(point, OWN_SAND_KM);
  const named = [
    ...near(point, SAME_NAME_KM).filter(
      c =>
        keys.some(k => namesAgree(c._key, k)) &&
        (distanceKm(point, c.coordinates) <= NEAR_NAME_KM || onOtherSand.every(o => o.id === c.id))
    ),
    ...near(point, anchored).filter(c => keys.some(k => namesAgree(c._key, k, true))),
    ...near(point, SAME_BREAK_KM + slackKm).filter(c => keys.some(k => spellingDrift(c._key, k))),
  ];
  if (named.length) {
    named.sort((a, b) => distanceKm(point, a.coordinates) - distanceKm(point, b.coordinates));
    attest(named[0], source, name, point);
    return true;
  }
  // Two independent signals that agree. The reference says a break is here;
  // the hand-curated list says this OSM place is a break. Tarnos-Plage and
  // Plage du Metro, "Lacanau - Supersud" and "Plage Super Sud (Lacanau)" are
  // the same sand under names no string rule should be trusted to join.
  const vouched = near(point, anchored)
    .filter(c => curatedMatch(c))
    .sort((a, b) => distanceKm(point, a.coordinates) - distanceKm(point, b.coordinates))[0];
  if (vouched) {
    attest(vouched, source, name, point);
    return true;
  }
  const closest = near(point, SAME_BREAK_KM).sort(
    (a, b) => distanceKm(point, a.coordinates) - distanceKm(point, b.coordinates)
  )[0];
  if (closest) {
    unconfirmed.push({
      source,
      reference: name,
      country,
      nearestPlace: closest.name,
      nearestId: closest.id,
      km: Number(distanceKm(point, closest.coordinates).toFixed(2)),
      lat: point.lat,
      lon: point.lon,
    });
  } else {
    misses[source].push({ name, country, lat: point.lat, lon: point.lon });
  }
  return false;
}

for (const [country, spots] of Object.entries(surfline)) {
  if (!COUNTRY_OF[country]) continue;
  for (const s of spots) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    resolveAnchored('surfline', s.name, { lat: s.lat, lon: s.lon }, country);
  }
}

// --- 2. References that carry only a name -------------------------------
// Matched inside the country, because a name on its own cannot be trusted to a
// region: surf-forecast's regions ("Gower", "La Cote Basque") are not ours.
const byCountry = new Map();
for (const p of places) {
  if (!byCountry.has(p.country)) byCountry.set(p.country, []);
  byCountry.get(p.country).push(p);
}

for (const [file, regions] of Object.entries(forecast)) {
  const country = COUNTRY_OF[file];
  if (!country) continue;
  const pool = byCountry.get(country) ?? [];
  for (const [region, breaks] of Object.entries(regions)) {
    if (/Wavefinder|Forecast Every/i.test(region)) continue;
    if (!(region in FORECAST_REGIONS)) {
      unmappedRegions.add(`${file} / ${region}`);
      continue;
    }
    const ours = FORECAST_REGIONS[region];
    if (ours === null) continue; // a coast this catalogue does not cover
    const scoped = pool.filter(p => ours.includes(p.community));
    for (const [rawName, slug] of breaks) {
      const at = forecastCoords[slug];
      if (Array.isArray(at)) {
        resolveAnchored('surf-forecast', rawName, { lat: at[0], lon: at[1] }, country, FORECAST_ROUNDING_KM);
        continue;
      }
      // "Rodiles - Main Beach" and "Marbella - Playa del Cable": the reference
      // qualifies a break with its town. Try the whole name first, then the part
      // that names the break.
      const variants = [rawName, ...rawName.split(/\s+-\s+/)].map(normalise).filter(Boolean);
      let hit = null;
      for (const v of variants) {
        const exact = scoped.filter(p => p._key === v || (!v.includes(' ') && !p._key.includes(' ') && genitive(p._key, v)));
        // No coordinate to anchor it, so no spelling drift ("La Playita" is not
        // "La Playiya") and no one-word generic names ("Point of Ness" reduces
        // to "ness", which is half the Scottish coast). A short name that is some
        // place's whole name -- Orio, Deba, Somo -- is still an exact match.
        const generic = v.replace(/ /g, '').length < 5 && !exact.length;
        if (generic) continue;
        const loose = exact.length ? exact : scoped.filter(p => namesAgree(p._key, v));
        if (loose.length === 0) continue;
        // Even inside one region a name can repeat. Take the unambiguous match,
        // or the one whose name is exactly the reference's; never guess between
        // two equal candidates -- record a miss instead, where it can be read.
        if (loose.length === 1) { hit = loose[0]; break; }
        const best = loose.filter(p => p._key === v);
        if (best.length === 1) { hit = best[0]; break; }
      }
      if (hit) attest(hit, 'surf-forecast', rawName);
      else misses['surf-forecast'].push({ name: rawName, country, region });
    }
  }
}

// --- One break, one place ------------------------------------------------
// Two references can resolve the same break to two neighbouring places:
// Surfline's Mundaka to Laidatxu, surf-forecast's to Hondartzape. A place is a
// duplicate when every name that attests it also attests a better-supported
// place within ONE_BREAK_KM; publishing both would list Mundaka twice.
const byId = new Map(places.map(p => [p.id, p]));
const support = id => {
  const ev = evidence.get(id);
  return new Set(ev.map(e => e.source)).size * 10 + ev.length;
};
/** How far a place is from where the references that name it put the break. */
const offset = (id, name) => {
  const refs = evidence.get(id).filter(e => e.ref && (!name || normalise(e.name) === name));
  return refs.length ? Math.min(...refs.map(e => distanceKm(byId.get(id).coordinates, e.ref))) : Infinity;
};
const outranks = (other, id, name) =>
  support(other) > support(id) || (support(other) === support(id) && offset(other, name) < offset(id, name));
const claims = new Map(); // normalised reference name -> place ids
for (const [id, ev] of evidence)
  for (const e of ev) {
    const k = normalise(e.name);
    if (!claims.has(k)) claims.set(k, new Set());
    claims.get(k).add(id);
  }
const duplicates = [];
for (const [id, ev] of [...evidence].sort((a, b) => support(a[0]) - support(b[0]))) {
  const here = byId.get(id).coordinates;
  const better = ev.map(e => {
    const name = normalise(e.name);
    return [...claims.get(name)].find(
      other =>
        other !== id &&
        evidence.has(other) &&
        outranks(other, id, name) &&
        distanceKm(here, byId.get(other).coordinates) <= ONE_BREAK_KM
    );
  });
  if (better.every(Boolean)) {
    duplicates.push({ id, name: byId.get(id).name, sameBreakAs: byId.get(better[0]).name, attestedAs: ev.map(e => e.name) });
    evidence.delete(id);
  }
}

// --- Result -------------------------------------------------------------
const attested = [...evidence.entries()]
  .map(([id, ev]) => {
    const p = byId.get(id);
    return {
      id,
      name: p.name,
      country: p.country,
      region: p.community,
      sources: [...new Set(ev.map(e => e.source))].sort(),
      attestedAs: [...new Set(ev.map(e => e.name))].sort(),
      // How far OSM's point is from where the reference puts the break. Not
      // published; stage 4's coordinate check reads it.
      referenceKm: ev.some(e => e.ref)
        ? Number(Math.min(...ev.filter(e => e.ref).map(e => distanceKm(p.coordinates, e.ref))).toFixed(2))
        : null,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const perRegion = new Map();
for (const a of attested) {
  const k = `${a.country}|${a.region}`;
  perRegion.set(k, (perRegion.get(k) ?? 0) + 1);
}

console.log(`${places.length} catalogued places`);
console.log(`${attested.length} attested as surf spots`);
console.log(`  by both references: ${attested.filter(a => a.sources.length === 2).length}`);
console.log(`  surfline only:      ${attested.filter(a => a.sources.join() === 'surfline').length}`);
console.log(`  surf-forecast only: ${attested.filter(a => a.sources.join() === 'surf-forecast').length}`);
if (unmappedRegions.size) {
  console.log(`\nreference regions with no mapping (add them to FORECAST_REGIONS):`);
  for (const r of unmappedRegions) console.log(`  ${r}`);
}
console.log(`\nreferences that matched nothing: surfline ${misses.surfline.length}, surf-forecast ${misses['surf-forecast'].length}`);
console.log(`places dropped as a second resolution of the same break: ${duplicates.length}`);
console.log(`references whose nearby OSM place has another name (review queue): ${unconfirmed.length}`);

console.log('\nper region:');
for (const [k, n] of [...perRegion].sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(4)}  ${k.replace('|', ' / ')}`);

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _readme: [
        'Places attested as surf spots, resolved to the OpenStreetMap catalogue.',
        '',
        'Generated by scripts/attest-surf-spots.mjs. Every field here comes from',
        'OpenStreetMap except `attestedAs`, which records the name a published',
        'surf reference used -- kept so a spot can be traced back to why it is in',
        'the catalogue, and so a wrong match can be found and removed.',
        '',
        'Stage 4 publishes a place only if it appears here.',
      ],
      generatedAt: new Date().toISOString().slice(0, 10),
      count: attested.length,
      spots: attested,
    },
    null,
    2
  )}\n`
);

writeFileSync(REPORT, `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), perRegion: Object.fromEntries(perRegion), misses, unconfirmed, duplicates }, null, 2)}\n`);
console.log(`\nwrote src/data/surf-spots.attested.json and the miss report to .cache/benchmark/`);

if (process.argv.includes('--report')) {
  console.log('\nsurfline references with no OSM place within 2 km:');
  for (const m of misses.surfline) console.log(`   ${m.country.padEnd(16)} ${m.name}  https://www.openstreetmap.org/#map=15/${m.lat}/${m.lon}`);
}
