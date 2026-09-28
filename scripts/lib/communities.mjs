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

/**
 * England's ceremonial county for each point, as the app names English
 * regions. OSM has a boundary=ceremonial relation only where the ceremonial
 * county differs from the administrative one (North Yorkshire takes in Redcar,
 * East Sussex takes in Brighton); where they coincide -- Norfolk, Suffolk,
 * Northumberland, Lincolnshire -- there is only the admin_level 6 county. So a
 * ceremonial county wins and the administrative one fills the gaps: querying
 * ceremonial alone put Newbiggin and Spittal in Tyne and Wear and Cromer in
 * Essex.
 *
 * A point inside a county is in it. A point on the waterline or at sea, as
 * surf-forecast's two-decimal coordinates often are, takes the county whose
 * boundary is nearest, ceremonial first where the two share a coast. Returns
 * index -> county name.
 */
export async function ceremonialCountiesOf(points, overpass, log = console.log) {
  const out = new Map();
  const BATCH = 8;
  const CEREMONIAL = '["boundary"="ceremonial"]';
  const COUNTY = '["boundary"="administrative"]["admin_level"="6"]';
  const box = ({ lat, lon }, km) => {
    const dLat = km / 110.54;
    const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
    return `${(lat - dLat).toFixed(4)},${(lon - dLon).toFixed(4)},${(lat + dLat).toFixed(4)},${(lon + dLon).toFixed(4)}`;
  };
  const metres = (p, a, b) => {
    const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
    const ky = 110_540;
    const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky;
    const dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * ky;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    return Math.hypot(ax + t * dx, ay + t * dy);
  };
  for (let start = 0; start < points.length; start += BATCH) {
    const batch = points.slice(start, start + BATCH);
    const parts = batch.map((p, k) =>
      [
        `make marker idx="${k}",kind="in-ceremonial";out;`,
        `is_in(${p.lat},${p.lon})->.a;`,
        `area.a${CEREMONIAL};out tags;`,
        `make marker idx="${k}",kind="in-county";out;`,
        `area.a${COUNTY};out tags;`,
        `make marker idx="${k}",kind="near-ceremonial";out;`,
        `rel${CEREMONIAL}(around:6000,${p.lat},${p.lon});out tags geom(${box(p, 7)});`,
        `make marker idx="${k}",kind="near-county";out;`,
        `rel${COUNTY}(around:6000,${p.lat},${p.lon});out tags geom(${box(p, 7)});`,
      ].join('\n')
    );
    const data = await overpass(`[out:json][timeout:180];\n${parts.join('\n')}`);
    const found = batch.map(() => ({ 'in-ceremonial': null, 'in-county': null, near: [] }));
    let k = -1;
    let kind = null;
    for (const el of data.elements ?? []) {
      if (el.type === 'marker') {
        k = Number(el.tags.idx);
        kind = el.tags.kind;
        continue;
      }
      const name = el.tags?.name;
      if (!name || k < 0) continue;
      if (kind === 'in-ceremonial' || kind === 'in-county') {
        found[k][kind] ??= name;
        continue;
      }
      let m = Infinity;
      for (const line of (el.members ?? []).map(mb => mb.geometry).filter(Boolean))
        for (let i = 1; i < line.length; i++) if (line[i - 1] && line[i]) m = Math.min(m, metres(batch[k], line[i - 1], line[i]));
      if (Number.isFinite(m)) found[k].near.push({ name, m, ceremonial: kind === 'near-ceremonial' });
    }
    found.forEach((f, j) => {
      let county = f['in-ceremonial'] ?? f['in-county'];
      if (!county && f.near.length) {
        const nearest = Math.min(...f.near.map(n => n.m));
        const close = f.near.filter(n => n.m <= nearest + 50);
        county = (close.find(n => n.ceremonial) ?? close.find(n => n.m === nearest)).name;
      }
      if (county) out.set(start + j, county);
    });
    log(`  counties: ${Math.min(start + BATCH, points.length)}/${points.length}`);
    await sleep(2000);
  }
  return out;
}
