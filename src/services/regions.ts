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
