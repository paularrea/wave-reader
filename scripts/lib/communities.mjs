/**
 * Which of the catalogue's regions an OSM object belongs to, from the address
 * Nominatim computes for it. Shared by the stages that add places one by one
 * (1.5 and 1.6) rather than region by region as stage 1 does.
 */

/** ISO 3166-2 codes of the regions stage 1 fetches, as the app names them. */
export const REGION_OF_ISO = {
  'ES-GA': 'Galicia',
  'ES-AS': 'Asturias',
  'ES-CB': 'Cantabria',
  'ES-PV': 'País Vasco',
  'ES-CT': 'Cataluña',
  'ES-VC': 'Comunidad Valenciana',
  'ES-MC': 'Murcia',
  'ES-AN': 'Andalucía',
  'ES-CN': 'Canarias',
  'ES-IB': 'Baleares',
  'ES-CE': 'Ceuta',
  'ES-ML': 'Melilla',
  'FR-HDF': 'Hauts-de-France',
  'FR-NOR': 'Normandie',
  'FR-BRE': 'Bretagne',
  'FR-PDL': 'Pays de la Loire',
  'FR-NAQ': 'Nouvelle-Aquitaine',
  'FR-OCC': 'Occitanie',
  'FR-PAC': "Provence-Alpes-Côte d'Azur",
  'FR-20R': 'Corse',
  'FR-RE': 'La Réunion',
  'FR-971': 'Guadeloupe',
  'FR-972': 'Martinique',
  'FR-GF': 'Guyane',
  'PT-16': 'Viana do Castelo',
  'PT-03': 'Braga',
  'PT-13': 'Porto',
  'PT-01': 'Aveiro',
  'PT-06': 'Coimbra',
  'PT-10': 'Leiria',
  'PT-11': 'Lisboa',
  'PT-15': 'Setúbal',
  'PT-02': 'Beja',
  'PT-08': 'Faro',
  'PT-20': 'Açores',
  'PT-30': 'Madeira',
};

const NOMINATIM = 'https://nominatim.openstreetmap.org/lookup';
const USER_AGENT = 'wave-reader-catalog/1.0 (https://github.com/paularrea/wave-reader)';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The region an address names, or null when it is not one the catalogue covers. */
export function regionOfAddress(address, country) {
  if (!address) return null;
  if (country === 'Ireland') return address.county?.replace(/^County /, '') ?? null;
  for (const key of ['ISO3166-2-lvl4', 'ISO3166-2-lvl3', 'ISO3166-2-lvl6']) {
    const region = REGION_OF_ISO[address[key]];
    if (region) return region;
  }
  return null;
}

/**
 * Nominatim addresses for OSM objects, 50 per request and one request a
 * second, per its usage policy. Returns "N123"/"W123"/"R123" -> address.
 */
export async function addressesOf(objects, log = console.log) {
  const out = new Map();
  const ids = objects.map(o => `${o.osmType[0].toUpperCase()}${o.osmId}`);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const res = await fetch(`${NOMINATIM}?osm_ids=${chunk.join(',')}&format=json&addressdetails=1`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        for (const place of await res.json()) out.set(`${place.osm_type[0].toUpperCase()}${place.osm_id}`, place.address);
      } else log(`  Nominatim ${res.status}`);
    } catch (err) {
      log(`  Nominatim failed (${err.message})`);
    }
    await sleep(1100);
  }
  return out;
}
