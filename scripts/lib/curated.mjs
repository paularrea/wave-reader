/**
 * The hand-curated break list (src/data/surf-spots.curated.json) and the rule
 * that decides which catalogued place a curated name refers to. Shared by
 * stage 3.5 (attestation, where the list is one of two signals that must
 * agree) and stage 4 (curation, where it sets the order of named breaks).
 */

import { readFileSync } from 'node:fs';

const CURATED_PATH = new URL('../../src/data/surf-spots.curated.json', import.meta.url);

export function normalise(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(praia|playa|platja|plage|beach|strand|traeth|hondartza|sands|cala|caleta|anse|de|del|dels|des|du|da|do|das|dos|la|le|les|los|el|els|s|sa|a|o|of|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Basque, Galician and Welsh OSM names carry a genitive the curated name does
 * not: Zarautz is mapped as "Zarauzko hondartza", Orio as "Orioko hondartza".
 * Two tokens are the same place when one is the other's stem, or when they
 * share a long enough stem that only the inflection differs.
 */
export function sameToken(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.startsWith(short) && long.length - short.length <= 3) return true;
  if (short.length < 5 || long.length - short.length > 4) return false;
  let common = 0;
  while (common < short.length && short[common] === long[common]) common++;
  return common >= 5;
}

export function tokensMatch(spotKey, curatedKey) {
  const curatedTokens = curatedKey.split(' ').filter(t => t.length >= 4);
  if (curatedTokens.length === 0) return false;
  const spotTokens = spotKey.split(' ');
  // The stem rule is for inflection, not for a name buried in a longer one.
  // Without this, "centrale" matched the "centre" inside "Plage naturiste du
  // centre de vacances d'Arnaoutchot" and let a nudist campsite in as a break.
  if (spotTokens.length > curatedTokens.length + 1) return false;
  return curatedTokens.every(c => spotTokens.some(s => sameToken(s, c)));
}


const curated = JSON.parse(readFileSync(CURATED_PATH));

/** Curated names per "country|region", normalised once. */
const curatedIndex = new Map();
for (const [country, regions] of Object.entries(curated)) {
  if (country.startsWith('_')) continue;
  for (const [region, names] of Object.entries(regions)) {
    // The order in the file is editorial: when two named breaks share a
    // forecast cell, the one listed first is the one surfers would name.
    curatedIndex.set(
      `${country}|${region}`,
      names.map((n, rank) => ({ raw: n, key: normalise(n), rank }))
    );
  }
}

/** The curated name this place answers to, or null. */
export function curatedMatch(spot) {
  const names = curatedIndex.get(`${spot.country}|${spot.community}`);
  if (!names) return null;
  const key = normalise(spot.name);
  if (!key) return null;
  // Exact first: "Sant Pol" must not claim "Sant Pol de Mar" while the real one waits.
  //
  // Containment runs one way only. Letting a short OSM name match a longer
  // curated one made the generic fragments -- "Plage du Nord", "La plage
  // Blanche" -- claim to be La Cantine Nord and La Lette Blanche, which both
  // kept them out of the deduplication and stole the real break's rank.
  return (
    names.find(n => n.key === key) ??
    names.find(n => n.key.length >= 5 && key.includes(n.key)) ??
    names.find(n => tokensMatch(key, n.key)) ??
    null
  );
}


/** Every curated name, as "country|region|name", for reporting the ones nothing matched. */
export function curatedNames() {
  return [...curatedIndex].flatMap(([key, names]) => names.map(n => `${key}|${n.raw}`));
}
