// Relative rather than the "@/" alias: Playwright's TypeScript loader does not
// apply tsconfig path mappings, and this module is imported directly by unit
// tests.
import catalogue from '../data/regions.json';

/**
 * Country and region selection.
 *
 * There is no "all regions" option: rendering every spot at once means a
 * forecast request per spot and an undifferentiated cloud of dots. A surfer is
 * choosing between breaks they can drive to, so the region is always a real one.
 *
 * This module reads `regions.json`, the only catalogue file the client always
 * downloads: the list of countries and their regions, plus one coarse point per
 * spot. The spots themselves live one file per country and are fetched only for
 * the country in focus. Keeping the points here is what lets geolocation resolve
 * to the nearest *spot* rather than to a bounding box -- regions interlock along
 * the coast, so a box drawn around Cantabria inevitably clips Asturias.
 */

const PREFERRED_DEFAULT_COUNTRY = 'Spain';
const PREFERRED_DEFAULT_REGION = 'Cataluña';

interface RegionEntry {
  name: string;
  spots: number;
}
interface CountryEntry {
  name: string;
  iso2: string;
  regions: RegionEntry[];
}

/** [latitude, longitude, index into countries, index into that country's regions] */
type Point = [number, number, number, number];

const countries = catalogue.countries as CountryEntry[];
const points = catalogue.points as Point[];

function regionNameAt(point: Point): string {
  return countries[point[2]].regions[point[3]].name;
}

export function allCountries(): string[] {
  return countries.map(c => c.name).sort((a, b) => a.localeCompare(b, 'es'));
}

export function countryIso2(country: string): string | null {
  return countries.find(c => c.name === country)?.iso2 ?? null;
}

export function regionsForCountry(country: string): string[] {
  const entry = countries.find(c => c.name === country);
  return entry ? entry.regions.map(r => r.name).sort((a, b) => a.localeCompare(b, 'es')) : [];
}

/** Every region, regardless of country. */
export function allRegions(): string[] {
  return countries.flatMap(c => c.regions.map(r => r.name)).sort((a, b) => a.localeCompare(b, 'es'));
}

/** How many spots a region publishes, for the selector's subtitle. */
export function spotCount(region: string): number {
  for (const country of countries) {
    const match = country.regions.find(r => r.name === region);
    if (match) return match.spots;
  }
  return 0;
}

/** Spots in the whole catalogue, for the transparency panel. */
export function totalSpots(): number {
  return countries.reduce((sum, c) => sum + c.regions.reduce((n, r) => n + r.spots, 0), 0);
}

export const DEFAULT_COUNTRY: string = allCountries().includes(PREFERRED_DEFAULT_COUNTRY)
  ? PREFERRED_DEFAULT_COUNTRY
  : (allCountries()[0] ?? PREFERRED_DEFAULT_COUNTRY);

/**
 * The fallback region, guaranteed to exist in the catalogue.
 *
 * Pointing the default at a region the catalogue does not contain would leave
 * the selector on a value with no option and the map empty, so it degrades to
 * the first region of the default country.
 */
export const DEFAULT_REGION: string = regionsForCountry(DEFAULT_COUNTRY).includes(
  PREFERRED_DEFAULT_REGION
)
  ? PREFERRED_DEFAULT_REGION
  : (regionsForCountry(DEFAULT_COUNTRY)[0] ?? PREFERRED_DEFAULT_REGION);

export function countryOfRegion(region: string): string {
  return countries.find(c => c.regions.some(r => r.name === region))?.name ?? DEFAULT_COUNTRY;
}

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat));
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Someone inland or abroad gets the default rather than a marginally closer coast. */
const MAX_SENSIBLE_KM = 250;

/**
 * The country and region of the spot nearest the user.
 *
 * Nearest-spot beats a bounding box: regions interlock along the coast and a
 * box drawn around Cantabria inevitably clips Asturias and the Basque Country.
 */
export function locationDefaults(lat: number, lon: number): { country: string; region: string } {
  let best: { country: string; region: string; km: number } | null = null;

  for (const point of points) {
    const km = haversineKm(lat, lon, point[0], point[1]);
    if (!best || km < best.km) {
      best = { country: countries[point[2]].name, region: regionNameAt(point), km };
    }
  }

  if (!best || best.km > MAX_SENSIBLE_KM) {
    return { country: DEFAULT_COUNTRY, region: DEFAULT_REGION };
  }
  return { country: best.country, region: best.region };
}

/** Backwards-compatible helper used where only the region matters. */
export function regionForLocation(lat: number, lon: number): string {
  return locationDefaults(lat, lon).region;
}

/** Bounding box of a region's spots, for framing the map when it changes. */
export function regionBounds(
  region: string
): { west: number; south: number; east: number; north: number } | null {
  const inRegion = points.filter(p => regionNameAt(p) === region);
  if (inRegion.length === 0) return null;

  const lats = inRegion.map(p => p[0]);
  const lons = inRegion.map(p => p[1]);
  return {
    west: Math.min(...lons),
    south: Math.min(...lats),
    east: Math.max(...lons),
    north: Math.max(...lats),
  };
}

/**
 * Below this zoom the map shows only the picked region; from it up, every
 * region with spots near the viewport, so panning from Cataluña to the Basque
 * coast brings the Basque spots with it. Zoomed out further than this the view
 * spans a country or more, and scoring all of it would spend the upstream
 * quota on spots too small to tell apart -- there the region picker decides.
 */
export const AUTO_REGION_ZOOM = 7;

/**
 * The closest the app ever opens: markers are up to 30 px across, and at zoom
 * 11 a kilometre of coast is about 14 px on a phone.
 */
export const CLOSE_ZOOM = 11;

/** How many spots the opening view frames around where it opens. */
const OPENING_SPOTS = 8;

export interface ViewBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** A box widened by `margin` of its own span on each side. */
export function widen(bounds: ViewBounds, margin: number): ViewBounds {
  const lat = (bounds.north - bounds.south) * margin;
  const lon = (bounds.east - bounds.west) * margin;
  return { west: bounds.west - lon, south: bounds.south - lat, east: bounds.east + lon, north: bounds.north + lat };
}

/**
 * The regions with spots inside `bounds`, most spots first. Counted on the
 * coarse points every client already has, so it needs no country index.
 */
export function regionsInBounds(bounds: ViewBounds): Array<{ country: string; region: string; spots: number }> {
  const counts = new Map<string, { country: string; region: string; spots: number }>();
  for (const point of points) {
    const [lat, lon] = point;
    if (lat < bounds.south || lat > bounds.north || lon < bounds.west || lon > bounds.east) continue;
    const region = regionNameAt(point);
    const entry = counts.get(region) ?? { country: countries[point[2]].name, region, spots: 0 };
    entry.spots += 1;
    counts.set(region, entry);
  }
  return [...counts.values()].sort((a, b) => b.spots - a.spots || a.region.localeCompare(b.region, 'es'));
}

/** How far around a spot its neighbours are counted when picking where to open. */
const CLUSTER_KM = 25;

/**
 * Where to open on a region: its nearest spot to `near` when given (the
 * surfer's own coast), otherwise the spot with most neighbours -- the stretch
 * of coast where the region's breaks are, not the middle of its bounding box,
 * which for Cataluña is inland and for the Canaries is open sea.
 */
export function openingPoint(region: string, near?: { lat: number; lon: number } | null): { lat: number; lon: number } | null {
  const inRegion = points.filter(p => regionNameAt(p) === region);
  if (inRegion.length === 0) return null;
  if (near) {
    let best = inRegion[0];
    let bestKm = Infinity;
    for (const p of inRegion) {
      const km = haversineKm(near.lat, near.lon, p[0], p[1]);
      if (km < bestKm) {
        best = p;
        bestKm = km;
      }
    }
    return { lat: best[0], lon: best[1] };
  }
  let densest = inRegion[0];
  let most = -1;
  for (const p of inRegion) {
    const neighbours = inRegion.filter(q => haversineKm(p[0], p[1], q[0], q[1]) <= CLUSTER_KM).length;
    if (neighbours > most) {
      densest = p;
      most = neighbours;
    }
  }
  return { lat: densest[0], lon: densest[1] };
}

/**
 * What the app frames when it opens: the handful of spots nearest the opening
 * point, whatever region they are in. On the Basque coast that is a few
 * kilometres; on Cataluña's sparser one a stretch of coast -- close in either
 * way, with room between markers, instead of a whole region stacked into dots.
 */
export function openingBounds(region: string, near?: { lat: number; lon: number } | null): ViewBounds | null {
  const at = openingPoint(region, near);
  if (!at) return null;
  const nearest = points
    .map(p => ({ p, km: haversineKm(at.lat, at.lon, p[0], p[1]) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, OPENING_SPOTS)
    .map(({ p }) => p);
  const lats = [at.lat, ...nearest.map(p => p[0])];
  const lons = [at.lon, ...nearest.map(p => p[1])];
  return { west: Math.min(...lons), south: Math.min(...lats), east: Math.max(...lons), north: Math.max(...lats) };
}
