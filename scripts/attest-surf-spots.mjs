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
 * catalogue. Here each reference contributes NAMES; the coordinate, the swell
 * window and every other config value come from OpenStreetMap. A surf-forecast
 * break no OSM place answers to is left unresolved and recorded in the report's
 * `forecastBreaks`; stage 3.5b publishes it at the coordinate its page prints.
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
import { curatedMatch, SECTION } from './lib/curated.mjs';
import { COUNTRY_OF, FORECAST_REGIONS, normalise, distanceKm, genitive, namesAgree, spellingDrift } from './lib/references.mjs';

const SPOTS = new URL('../src/data/spots.json', import.meta.url);
const SURFLINE = new URL('../.cache/benchmark/surfline-spots.json', import.meta.url);
const FORECAST = new URL('../.cache/benchmark/surf-forecast-breaks.json', import.meta.url);
/** Per break, the coordinate its surf-forecast page prints: { slug: [lat, lon] }. */
const FORECAST_COORDS = new URL('../.cache/benchmark/surf-forecast-coords.json', import.meta.url);
const OUT = new URL('../src/data/surf-spots.attested.json', import.meta.url);
/**
 * Decisions made by hand for references the rules below cannot resolve, or
 * resolve wrongly. Versioned: each names the OSM object that IS the break, or
 * says why there is none. See the file's own _readme.
 */
const REVIEWED = new URL('../src/data/surf-spots.reviewed.json', import.meta.url);
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

/** A reviewed decision is not applied to a reference whose own point is further away. */
const REVIEW_REACH_KM = 25;

/** Two places attested by the same name this close together are one break. */
const ONE_BREAK_KM = 2;

/** Name matches closer than this need nothing else. */
const NEAR_NAME_KM = 3;

/** A reference point within this of a mapped beach is standing on that beach. */
const OWN_SAND_KM = 1;

/** With a name in common, the two can be further apart and still be one place. */
const SAME_NAME_KM = 6;

// --- Load ---------------------------------------------------------------
if (!existsSync(SURFLINE) || !existsSync(FORECAST)) {
  console.error('Reference files missing from .cache/benchmark/. They are not versioned;');
  console.error('rebuild them by hand before running this stage.');
  process.exit(1);
}

// Stage 3.5b's breaks are surf-forecast's own coordinates, added after this
// stage for the breaks no OSM place answered to. They are not candidates here:
// a break is resolved against OpenStreetMap first, every run.
// A dog or naturist section of a beach is never the break, however well its
// name matches.
const places = JSON.parse(readFileSync(SPOTS)).filter(p => p.provenance?.source !== 'surf-forecast' && !SECTION.test(p.name));
const surfline = JSON.parse(readFileSync(SURFLINE));
const forecast = JSON.parse(readFileSync(FORECAST));
// Optional: without it, surf-forecast names are matched by name inside their
// region only, which leaves town-named breaks ("Laredo", "Mimizan") unresolved.
const forecastCoords = existsSync(FORECAST_COORDS) ? JSON.parse(readFileSync(FORECAST_COORDS)) : {};

for (const p of places) p._key = normalise(p.name);

const reviewed = existsSync(REVIEWED) ? JSON.parse(readFileSync(REVIEWED)) : {};
/**
 * "country|reference name" -> the decision recorded for it, or
 * "country|reference region|name" where one country lists two breaks under the
 * same name: surf-forecast has a Calita in Cádiz and another in Alicante.
 */
const reviewedByRef = new Map();
const reviewKey = (country, name, region) => (region ? `${country}|${region}|${name}` : `${country}|${name}`);
for (const [country, list] of Object.entries(reviewed)) {
  if (country.startsWith('_')) continue;
  for (const decision of list) reviewedByRef.set(reviewKey(country, decision.reference, decision.region), decision);
}
const byOsm = new Map(places.map(p => [`${p.provenance?.osmType}/${p.provenance?.osmId}`, p]));
/** Reviewed decisions whose OSM object is not in the catalogue: stage 1.6 or 2 has to add it. */
const reviewedMissing = [];
/** References reviewed and found to have no OSM place of their own. */
const reviewedAbsent = [];
const usedReviews = new Set();

/**
 * A reviewed decision replaces the rules for that reference entirely, in both
 * directions: it attests the place a person checked, and stops the rules from
 * attesting the one they would have picked (Rodiles resolved to the Playina,
 * a pocket of sand in the estuary, not the beach the wave breaks off).
 */
function applyReview(source, name, country, point, referenceRegion) {
  const regional = referenceRegion && reviewKey(country, name, referenceRegion);
  const key = regional && reviewedByRef.has(regional) ? regional : reviewKey(country, name);
  const decision = reviewedByRef.get(key);
  if (!decision) return false;
  if (decision.absent) {
    usedReviews.add(key);
    reviewedAbsent.push({ source, reference: name, country, referenceRegion, why: decision.absent });
    return true;
  }
  const place = byOsm.get(decision.osm);
  if (!place) {
    usedReviews.add(key);
    reviewedMissing.push({ source, reference: name, country, osm: decision.osm });
    return true;
  }
  // A decision is about one break. The same name far away is another one:
  // surf-forecast has a Playa de San Juan in Alicante and another in Asturias.
  if (point && distanceKm(point, place.coordinates) > REVIEW_REACH_KM) return false;
  usedReviews.add(key);
  attest(place, source, name, point, referenceRegion, true);
  return true;
}

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
function attest(place, source, name, ref = null, referenceRegion = null, byReview = false) {
  if (!evidence.has(place.id)) evidence.set(place.id, []);
  const list = evidence.get(place.id);
  if (!list.some(e => e.source === source && e.name === name && e.referenceRegion === referenceRegion))
    list.push({ source, name, ref, referenceRegion, byReview });
}

const misses = { surfline: [], 'surf-forecast': [] };
/** Every surf-forecast break looked at, and (at the end) the place it resolved to. */
const forecastBreaks = [];
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
function resolveAnchored(source, name, point, country, slackKm = 0, referenceRegion = null) {
  if (applyReview(source, name, country, point, referenceRegion)) return true;
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
    // The place named exactly as the reference first: "Playa de Galizano" is
    // the beach, not Cabo de Galizano beside it, even when the cape is nearer.
    const exact = c => (keys.includes(c._key) ? 0 : 1);
    named.sort((a, b) => exact(a) - exact(b) || distanceKm(point, a.coordinates) - distanceKm(point, b.coordinates));
    attest(named[0], source, name, point, referenceRegion);
    return true;
  }
  // Two independent signals that agree. The reference says a break is here;
  // the hand-curated list says this OSM place is a break. Tarnos-Plage and
  // Plage du Metro, "Lacanau - Supersud" and "Plage Super Sud (Lacanau)" are
  // the same sand under names no string rule should be trusted to join.
  // Beaches only. A headland shares a word with the beach beside it -- Punta
  // do Ancoradouro and the curated Ancoradouro, Punta de Tarifa and Tarifa --
  // so a cape is attested only by a reference that names it.
  const vouched = near(point, anchored)
    .filter(c => curatedMatch(c) && !['cape', 'reef'].includes(c.provenance?.feature))
    .sort((a, b) => distanceKm(point, a.coordinates) - distanceKm(point, b.coordinates))[0];
  if (vouched) {
    attest(vouched, source, name, point, referenceRegion);
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
      forecastBreaks.push({ country, region, name: rawName, slug, lat: at?.[0] ?? null, lon: at?.[1] ?? null });
      if (!Array.isArray(at) && applyReview('surf-forecast', rawName, country, null, region)) continue;
      if (Array.isArray(at)) {
        resolveAnchored('surf-forecast', rawName, { lat: at[0], lon: at[1] }, country, FORECAST_ROUNDING_KM, region);
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
      if (hit) attest(hit, 'surf-forecast', rawName, null, region);
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
  // A person checked a reviewed place; the rules only guessed at the others.
  return (ev.some(e => e.byReview) ? 100 : 0) + new Set(ev.map(e => e.source)).size * 10 + ev.length;
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

// --- One place, one surf-forecast break ---------------------------------
// surf-forecast lists peaks, not beaches: Las Canteras is El Lloret, La Cicer,
// El Circo and Vagabundo on their page. Resolved by name they can all land on
// the one OSM beach, and would show as one marker under the beach's name. The
// catalogue lists every break they list, so the place keeps the break that
// best fits it -- the one named as the place is (Zurriola hondartza, not the
// reviewed "Playa de Gros"), then one a person checked, then the one whose own
// coordinate is nearest -- and the others are left unresolved, for stage 3.5b
// to publish at their own coordinates.
const keyOf = e => `${e.referenceRegion}|${e.name}`;
const secondBreaks = [];
for (const [id, ev] of evidence) {
  const place = byId.get(id);
  const theirs = [...new Map(ev.filter(e => e.source === 'surf-forecast').map(e => [keyOf(e), e])).values()];
  if (theirs.length < 2) continue;
  const named = e => [e.name, ...e.name.split(/\s+[-\/]\s+|\s*\(|\)/)].map(normalise).filter(Boolean);
  const rank = e => [
    named(e).some(k => namesAgree(place._key, k, true)) ? 0 : 1,
    normalise(e.name) === place._key ? 0 : 1,
    e.byReview ? 0 : 1,
    e.ref ? distanceKm(place.coordinates, e.ref) : Infinity,
  ];
  const cmp = (a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3];
  };
  const [kept, ...others] = theirs.sort(cmp);
  const dropped = new Set(others.map(keyOf));
  evidence.set(id, ev.filter(e => e.source !== 'surf-forecast' || !dropped.has(keyOf(e))));
  for (const o of others) secondBreaks.push({ reference: o.name, region: o.referenceRegion, place: place.name, keptFor: kept.name });
}

// Which place each surf-forecast break ended on, after both rules above.
const resolvedTo = new Map();
for (const [id, ev] of evidence)
  for (const e of ev) if (e.source === 'surf-forecast') resolvedTo.set(keyOf(e), id);
for (const b of forecastBreaks) b.placeId = resolvedTo.get(`${b.region}|${b.name}`) ?? null;

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
      /**
       * The one surf-forecast break this place is. Stage 4 publishes it under
       * that name when OSM's says something else ("La Concha" is mapped as
       * Kontxa hondartza), so the list reads as theirs does.
       */
      forecastName: ev.find(e => e.source === 'surf-forecast')?.name ?? null,
      ...(ev.some(e => e.byReview) ? { reviewed: true } : {}),
      /**
       * The region surf-forecast files this break under, which is not always
       * the county it stands in: Tullaghan is in Leitrim and they list it in
       * Donegal. Stage 4 publishes Irish spots under this name.
       */
      referenceRegion: ev.find(e => e.referenceRegion)?.referenceRegion ?? null,
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
console.log(`surf-forecast breaks sharing a place with another of theirs, left for stage 3.5b: ${secondBreaks.length}`);
{
  const covered = forecastBreaks.filter(b => FORECAST_REGIONS[b.region]);
  const onOsm = covered.filter(b => b.placeId).length;
  console.log(`surf-forecast breaks resolved to an OSM place: ${onOsm} of ${covered.length}; the rest go to stage 3.5b`);
}
console.log(`references whose nearby OSM place has another name (review queue): ${unconfirmed.length}`);
console.log(`reviewed by hand: ${usedReviews.size} applied, ${reviewedAbsent.length} recorded as having no OSM place`);
if (reviewedMissing.length) {
  console.log(`\nreviewed places missing from the catalogue (run stage 1.6, then 2 and 3):`);
  for (const m of reviewedMissing) console.log(`  ${m.country} / ${m.reference} -> ${m.osm}`);
}
const unusedReviews = [...reviewedByRef.keys()].filter(k => !usedReviews.has(k));
if (unusedReviews.length) console.log(`\nreviewed decisions no reference used (renamed upstream?): ${unusedReviews.join(', ')}`);

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

writeFileSync(
  REPORT,
  `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), perRegion: Object.fromEntries(perRegion), misses, unconfirmed, duplicates, secondBreaks, reviewedAbsent, reviewedMissing, forecastBreaks }, null, 2)}\n`
);
console.log(`\nwrote src/data/surf-spots.attested.json and the miss report to .cache/benchmark/`);

if (process.argv.includes('--report')) {
  console.log('\nsurfline references with no OSM place within 2 km:');
  for (const m of misses.surfline) console.log(`   ${m.country.padEnd(16)} ${m.name}  https://www.openstreetmap.org/#map=15/${m.lat}/${m.lon}`);
}
