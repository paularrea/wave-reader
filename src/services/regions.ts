// Relative rather than the "@/" alias: Playwright's TypeScript loader does not
// apply tsconfig path mappings, and this module is imported directly by unit
// tests.
import spots from '../data/spots.index.json';

/**
 * Country and region selection.
 *
 * There is no "all regions" option: rendering every spot at once means a
 * forecast request per spot and an undifferentiated cloud of dots. A surfer is
 * choosing between breaks they can drive to, so the region is always a real one.
 */

const PREFERRED_DEFAULT_COUNTRY = 'Spain';
const PREFERRED_DEFAULT_REGION = 'Cataluña';

interface CatalogueSpot {
  country?: string;
  community: string;
  coordinates: { lat: number; lon: number };
}

const catalogue = spots as unknown as CatalogueSpot[];

/** Older catalogue entries predate the country field; they are Spanish. */
function countryOf(spot: CatalogueSpot): string {
  return spot.country ?? 'Spain';
}

export function allCountries(): string[] {
  return [...new Set(catalogue.map(countryOf))].sort((a, b) => a.localeCompare(b, 'es'));
}

export function regionsForCountry(country: string): string[] {
  return [
    ...new Set(catalogue.filter(s => countryOf(s) === country).map(s => s.community)),
  ].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Every region, regardless of country. */
export function allRegions(): string[] {
  return [...new Set(catalogue.map(s => s.community))].sort((a, b) => a.localeCompare(b, 'es'));
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
  const match = catalogue.find(s => s.community === region);
  return match ? countryOf(match) : DEFAULT_COUNTRY;
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
 * It also needs no extra network call -- the catalogue is already loaded.
 */
export function locationDefaults(lat: number, lon: number): { country: string; region: string } {
  let best: { country: string; region: string; km: number } | null = null;

  for (const spot of catalogue) {
    const km = haversineKm(lat, lon, spot.coordinates.lat, spot.coordinates.lon);
    if (!best || km < best.km) {
      best = { country: countryOf(spot), region: spot.community, km };
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
  const inRegion = catalogue.filter(s => s.community === region);
  if (inRegion.length === 0) return null;

  const lats = inRegion.map(s => s.coordinates.lat);
  const lons = inRegion.map(s => s.coordinates.lon);
  return {
    west: Math.min(...lons),
    south: Math.min(...lats),
    east: Math.max(...lons),
    north: Math.max(...lats),
  };
}
