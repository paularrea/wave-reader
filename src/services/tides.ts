/**
 * High/low tide detection from Open-Meteo's hourly sea-level series.
 *
 * Open-Meteo has no tide-extremes endpoint, so we read the local maxima and
 * minima out of `sea_level_height_msl`. Resolution is hourly, so an extreme is
 * accurate to roughly +/- 30 min -- the UI says so rather than implying
 * minute-level precision we do not have.
 */

export type TideKind = 'high' | 'low';

export interface TideExtreme {
  kind: TideKind;
  /** `YYYY-MM-DDTHH:00` in the spot's local time. */
  timestamp: string;
  /** Sea level in metres relative to MSL. */
  heightM: number;
}

/**
 * Model noise produces tiny wiggles that are not tides. An extreme must differ
 * from its neighbouring extreme by at least this much to count.
 */
const MIN_PROMINENCE_M = 0.1;

export interface TideSeries {
  time: string[];
  seaLevel: (number | null)[];
}

/**
 * Finds tide extremes across the whole series. Plateaus (equal consecutive
 * values) are handled by comparing against the nearest differing neighbours,
 * so a flat peak still yields exactly one extreme.
 */
export function findTideExtremes(series: TideSeries): TideExtreme[] {
  const { time, seaLevel } = series;
  const raw: TideExtreme[] = [];

  for (let i = 1; i < seaLevel.length - 1; i++) {
    const value = seaLevel[i];
    if (value === null) continue;

    // Walk outwards past equal values to find the first differing neighbours.
    let left = i - 1;
    while (left >= 0 && (seaLevel[left] === null || seaLevel[left] === value)) left--;
    let right = i + 1;
    while (right < seaLevel.length && (seaLevel[right] === null || seaLevel[right] === value)) right++;

    if (left < 0 || right >= seaLevel.length) continue;

    const prev = seaLevel[left] as number;
    const next = seaLevel[right] as number;

    // Only the first index of a plateau reports the extreme.
    if (seaLevel[i - 1] === value) continue;

    if (value > prev && value > next) {
      raw.push({ kind: 'high', timestamp: time[i], heightM: value });
    } else if (value < prev && value < next) {
      raw.push({ kind: 'low', timestamp: time[i], heightM: value });
    }
  }

  // Drop extremes too shallow to be a real tide turn.
  return raw.filter((extreme, i) => {
    const neighbour = raw[i + 1] ?? raw[i - 1];
    if (!neighbour) return true;
    return Math.abs(extreme.heightM - neighbour.heightM) >= MIN_PROMINENCE_M;
  });
}

/** The extremes falling on one local day, chronologically ordered. */
export function tidesForDay(series: TideSeries, day: string): TideExtreme[] {
  return findTideExtremes(series).filter(extreme => extreme.timestamp.startsWith(day));
}
