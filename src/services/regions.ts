// Relative rather than the "@/" alias: Playwright's TypeScript loader does not
// apply tsconfig path mappings, and this module is imported directly by unit
// tests.
import spots from '../data/spots.json';

/**
 * Region selection.
 *
 * There is no "all regions" option: rendering every spot in Spain at once means
 * a forecast request per spot, and the map becomes an undifferentiated cloud of
 * dots. A surfer is choosing between breaks they can drive to, so the region is
 * always a real one.
 */

/** Preferred fallback when geolocation is refused, unavailable, or far inland. */
const PREFERRED_DEFAULT = 'Cataluña';

export function allRegions(): string[] {
  return [...new Set(spots.map(s => s.community))].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * The fallback region, guaranteed to exist in the catalogue.
 *
 * Pointing the default at a region the catalogue does not contain would leave
 * the selector on a value with no option and the map empty, so it degrades to
 * the first region available.
 */
export const DEFAULT_REGION: string = allRegions().includes(PREFERRED_DEFAULT)
  ? PREFERRED_DEFAULT
  : (allRegions()[0] ?? PREFERRED_DEFAULT);

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * The region of the spot nearest the user.
 *
 * Nearest-spot beats a bounding box: the communities interlock along the coast
 * and a box drawn around Cantabria inevitably clips Asturias and the Basque
 * Country. It also needs no extra network call -- the catalogue is already
 * loaded.
 */
export function regionForLocation(lat: number, lon: number): string {
  let best: { community: string; km: number } | null = null;

  for (const spot of spots) {
    const km = haversineKm(lat, lon, spot.coordinates.lat, spot.coordinates.lon);
    if (!best || km < best.km) best = { community: spot.community, km };
  }

  // Someone in Madrid or abroad gets the default rather than being dragged to
  // whichever coast happens to be marginally closer.
  const MAX_SENSIBLE_KM = 250;
  if (!best || best.km > MAX_SENSIBLE_KM) return DEFAULT_REGION;

  return best.community;
}
