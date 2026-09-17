/**
 * What the map knows about the spots in view, ranked for the bottom sheet:
 * the best spots at the selected hour and the best score of each day.
 *
 * Batches carry every hour of the horizon as parallel arrays anchored at a UTC
 * hour, so any hour is a lookup and needs no request.
 */

export interface SpotHorizon {
  id: string;
  name: string;
  /** UTC ms of index 0. */
  startMs: number;
  /** -1 where the hour is unrated. */
  stars: number[];
  swellStars: number[];
  /** Decimetres, -1 when unknown. */
  height: number[];
  /** Seconds, -1 when unknown. */
  period: number[];
  danger: number[];
}

export interface HourRating {
  stars: number;
  swellStars: number;
  heightM: number | null;
  periodS: number | null;
  isDangerous: boolean;
}

const HOUR_MS = 3_600_000;

export function ratingAt(spot: SpotHorizon, targetMs: number): HourRating | null {
  const index = Math.round((targetMs - spot.startMs) / HOUR_MS);
  if (index < 0 || index >= spot.stars.length) return null;
  const stars = spot.stars[index];
  if (stars === undefined || stars < 0) return null;
  const height = spot.height[index];
  const period = spot.period[index];
  return {
    stars,
    swellStars: Math.max(stars, spot.swellStars[index] ?? stars),
    heightM: height === undefined || height < 0 ? null : height / 10,
    periodS: period === undefined || period < 0 ? null : period,
    isDangerous: spot.danger.includes(index),
  };
}

export interface BestSpot extends HourRating {
  id: string;
  name: string;
}

/** Highest score first; ties go to the better swell, then the bigger one. */
export function bestAt(spots: SpotHorizon[], targetMs: number, count = 3): BestSpot[] {
  const rated: BestSpot[] = [];
  for (const spot of spots) {
    const rating = ratingAt(spot, targetMs);
    if (rating) rated.push({ id: spot.id, name: spot.name, ...rating });
  }
  rated.sort(
    (a, b) =>
      b.stars - a.stars ||
      b.swellStars - a.swellStars ||
      (b.heightM ?? 0) - (a.heightM ?? 0) ||
      a.name.localeCompare(b.name)
  );
  return rated.slice(0, count);
}

/**
 * Best score per local day across the horizon. `dayOf` maps an hour offset to
 * its local day key, so days follow the same timezone as the timeline.
 */
export function bestByDay(
  spots: SpotHorizon[],
  hourCount: number,
  targetMsAt: (hourOffset: number) => number,
  dayOf: (hourOffset: number) => string
): Record<string, number> {
  const best: Record<string, number> = {};
  for (let h = 0; h < hourCount; h++) {
    const day = dayOf(h);
    const target = targetMsAt(h);
    let top = best[day] ?? -1;
    for (const spot of spots) {
      const rating = ratingAt(spot, target);
      if (rating && rating.stars > top) top = rating.stars;
    }
    best[day] = top;
  }
  return best;
}
