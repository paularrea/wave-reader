/**
 * Which sea a spot faces, from its coordinates.
 *
 * The rating's energy scale is calibrated to surf-forecast, which is an
 * Atlantic scale: in the Mediterranean the long-period swells that score well
 * there simply do not happen, so a genuinely good Mediterranean day scored 0.
 * Spots are classified here and rated on the scale for their basin.
 */
export type Basin = 'atlantic' | 'mediterranean';

/** Longitude of the Strait of Gibraltar: west of it is Atlantic. */
const GIBRALTAR_LON = -5.61;

export function basinOf(lat: number, lon: number): Basin {
  // Canaries and anything south of the Mediterranean's latitude band.
  if (lat < 34 || lat > 46) return 'atlantic';
  // Gulf of Cádiz, Portugal, Galicia.
  if (lon <= GIBRALTAR_LON) return 'atlantic';
  // Bay of Biscay and the Channel share the Mediterranean's longitudes but not
  // its sea: the Cantabrian coast, the Basque coast and western France.
  if (lat >= 43.2 && lon < 1.5) return 'atlantic';
  return 'mediterranean';
}
