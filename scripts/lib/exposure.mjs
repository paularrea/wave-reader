/**
 * Which way a point on the coast faces the open sea, and the surf config that
 * follows. Shared by stage 2 (every OSM shore feature) and stage 3.5b (the
 * surf-forecast breaks with no OSM place), so a break gets its swell window by
 * the same rule wherever its coordinate came from.
 *
 * Method: probe elevation along 12 compass bearings 6 km out. A bearing counts
 * as open water when the sample is at or below sea level. A spot needs a
 * contiguous arc of open water to be surfable -- a cove inside a ría has water
 * in front of it but no swell window.
 */

export const BEARINGS = 12;                   // 30 degrees apart
/**
 * One distance, not three.
 *
 * The elevation endpoint caps a request at 100 coordinates and Open-Meteo
 * enforces per-minute and per-hour limits, so probe points are the budget. A
 * single sample 6 km out already separates open ocean from the head of a ría:
 * at 12 bearings a narrow inlet leaves at most one or two bearings clear, well
 * under the contiguous arc a surfable spot needs. Dropping from 48 probes per
 * beach to 12 cut the run from 2,435 requests to about 600.
 */
const PROBE_KM = [6];
const MIN_OPEN_ARC = 3;                // >= 90 degrees of open water
/**
 * Ireland's surf beaches sit at the head of bays facing the mouth: Lahinch in
 * Liscannor Bay, Inch in Dingle Bay, Enniscrone in Killala Bay, Portsalon in
 * Lough Swilly. 6 km out, the mouth spans only one or two bearings, so the 90
 * degree rule dropped all of them. Since stage 3.5 publishes only places a surf
 * reference names, this stage no longer has to keep ría coves out by itself;
 * for Ireland one open bearing is enough, and it still measures the window.
 * Other countries keep 90 degrees until they are re-derived on purpose.
 */
export const MIN_OPEN_ARC_BY_COUNTRY = {
  Ireland: 1,
  /**
   * Spain for the same reason, re-derived on 2026-09-28: Bastiagueiro in the
   * ría of A Coruña, A Barra at the mouth of the ría de Vigo, La Concha inside
   * Donostia's bay all break with one or two bearings open 6 km out.
   */
  Spain: 1,
  /** Portugal from its first run: Nazaré's Praia do Norte and Peniche's bay beaches. */
  Portugal: 1,
};
/**
 * ETOPO1 returns bathymetry, so open water is genuinely negative rather than
 * the ambiguous 0 a land-only model gives for anything at sea level.
 */
const SEA_LEVEL_M = 0;

const KM_PER_DEG_LAT = 110.574;

function destination(lat, lon, bearingDeg, km) {
  const dLat = km / KM_PER_DEG_LAT;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    lat: lat + dLat * Math.cos(rad),
    lon: lon + dLon * Math.sin(rad),
  };
}

/** Every probe point for one beach, ordered bearing-major. */
export function probePoints(beach) {
  const points = [];
  for (let b = 0; b < BEARINGS; b++) {
    const bearing = (360 / BEARINGS) * b;
    for (const km of PROBE_KM) {
      points.push(destination(beach.lat, beach.lon, bearing, km));
    }
  }
  return points;
}

/** Circular mean of a set of bearings, in degrees. */
function meanBearing(bearings) {
  let x = 0;
  let y = 0;
  for (const b of bearings) {
    const rad = (b * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Longest run of consecutive open-water bearings, wrapping around north. */
function longestOpenArc(isOpen) {
  const n = isOpen.length;
  if (isOpen.every(Boolean)) return { length: n, bearings: isOpen.map((_, i) => (360 / n) * i) };

  let best = { length: 0, bearings: [] };
  for (let start = 0; start < n; start++) {
    if (!isOpen[start] || isOpen[(start - 1 + n) % n]) continue; // only run starts
    const run = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (!isOpen[i]) break;
      run.push((360 / n) * i);
    }
    if (run.length > best.length) best = { length: run.length, bearings: run };
  }
  return best;
}

/**
 * `minArc` overrides the country's floor, in bearings. Stage 3.5b passes 1: a
 * break surf-forecast lists is a break, and the arc only measures its window.
 */
export function analyse(beach, values, minArc = MIN_OPEN_ARC_BY_COUNTRY[beach.country] ?? MIN_OPEN_ARC) {
  const isOpen = [];
  for (let b = 0; b < BEARINGS; b++) {
    const samples = PROBE_KM.map((_, d) => values[b * PROBE_KM.length + d]);
    if (samples.some(v => typeof v !== 'number')) {
      isOpen.push(false);
      continue;
    }
    // Open water all the way out: no land blocking the swell on this bearing.
    isOpen.push(samples.every(v => v <= SEA_LEVEL_M));
  }

  const arc = longestOpenArc(isOpen);
  if (arc.length < minArc) {
    return { surfable: false, reason: `open arc of only ${arc.length * (360 / BEARINGS)} degrees` };
  }

  const facing = Math.round(meanBearing(arc.bearings));
  const halfArc = (arc.length * (360 / BEARINGS)) / 2;

  return {
    surfable: true,
    facing,
    exposureDeg: Math.round(arc.length * (360 / BEARINGS)),
    // The swell window is the open arc itself: swell from outside it is blocked.
    swellWindow: {
      minAngle: Math.round((facing - halfArc + 360) % 360),
      maxAngle: Math.round((facing + halfArc) % 360),
    },
    // Offshore wind blows from the land, opposite the way the beach faces.
    offshoreWindAngle: Math.round((facing + 180) % 360),
  };
}

export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * What the spot detail calls the place. A cape is a point break, not a beach,
 * and a break stage 1.5 could only resolve to the village behind it is neither
 * -- calling Mullaghmore a beach would be a claim OSM never made.
 */
export const TYPE_OF_FEATURE = {
  cape: 'Point',
  reef: 'Reef',
  island: 'Island',
  islet: 'Island',
  village: 'Break',
  town: 'Break',
  hamlet: 'Break',
  locality: 'Break',
  suburb: 'Break',
};

/**
 * Generic ranges by skill level. OSM knows nothing about how a given bank
 * breaks, so these are honest defaults rather than invented per-spot numbers.
 */
export const IDEAL_HEIGHT = {
  beginner: { min: 0.4, max: 1.2 },
  intermediate: { min: 1.0, max: 2.5 },
  expert: { min: 2.0, max: 5.0 },
};
