import { MarineForecast } from './marine-api';

export type SkillLevel = 'beginner' | 'intermediate' | 'expert';

export interface SpotConfig {
  swellWindow: { minAngle: number; maxAngle: number };
  offshoreWindAngle: number;
  windTolerance: number;
  idealHeight: Record<SkillLevel, { min: number; max: number }>;
}

export interface StarRatingResult {
  stars: number;
  safety: {
    isDangerous: boolean;
    reason: string | null;
  };
  /** True when the rating could not be computed because data is missing. */
  unrated: boolean;
}

const UNRATED: StarRatingResult = {
  stars: 0,
  safety: { isDangerous: false, reason: null },
  unrated: true,
};

/** Shortest angular distance between two bearings, 0-180. */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

export function calculateStarRating(
  forecast: MarineForecast,
  config: SpotConfig,
  level: SkillLevel,
  spotName = 'this spot'
): StarRatingResult {
  const swellDir = forecast.swellDirection;
  const height = forecast.swellHeight;

  // Without swell height or direction there is nothing to rate. Returning 0
  // here would read as "flat", which is a different claim than "unknown".
  if (swellDir === null || height === null) return UNRATED;

  // 1. Swell window filter, handling wrap-around (e.g. 350 -> 10 degrees).
  const { minAngle, maxAngle } = config.swellWindow;
  const isInWindow =
    minAngle <= maxAngle
      ? swellDir >= minAngle && swellDir <= maxAngle
      : swellDir >= minAngle || swellDir <= maxAngle;

  const ideal = config.idealHeight[level];

  // 2. Safety check runs even when the swell misses the window: a closed-out
  //    spot can still be dangerous to paddle out at.
  const safety = assessSafety(height, ideal, level, spotName);

  if (!isInWindow) {
    return { stars: 0, safety, unrated: false };
  }

  // 3. Base score from how well the height matches the surfer's range.
  let score: number;
  if (height >= ideal.min && height <= ideal.max) {
    score = 10;
  } else {
    const deviation = height < ideal.min ? ideal.min - height : height - ideal.max;
    score = Math.max(0, 10 - deviation * 5); // 5 points lost per metre off range
  }

  // 4. Wind weighting. Unknown wind leaves the score untouched rather than
  //    inventing a penalty or a bonus.
  if (forecast.windDirection !== null) {
    const offshoreDistance = angularDistance(forecast.windDirection, config.offshoreWindAngle);
    if (offshoreDistance <= config.windTolerance) {
      score *= 1.2;
    } else if (offshoreDistance > 180 - config.windTolerance) {
      score *= 0.6;
    }
  }

  // 5. Period bonus: long-period groundswell beats short-period windswell.
  if (forecast.swellPeriod !== null) {
    if (forecast.swellPeriod > 10) score += 1;
    if (forecast.swellPeriod > 14) score += 1;
  }

  return {
    stars: Math.min(10, Math.max(0, Math.round(score))),
    safety,
    unrated: false,
  };
}

/**
 * Names the magnitude, the limit and the spot, so the surfer can tell *why*
 * these conditions are out of their depth rather than just seeing a red box.
 */
function assessSafety(
  height: number,
  ideal: { min: number; max: number },
  level: SkillLevel,
  spotName: string
): StarRatingResult['safety'] {
  if (level !== 'beginner' || height <= ideal.max) {
    return { isDangerous: false, reason: null };
  }

  const over = (height - ideal.max).toFixed(1);
  return {
    isDangerous: true,
    reason:
      `Waves at ${spotName} are forecast at ${height.toFixed(1)}m, ` +
      `${over}m above the ${ideal.max}m ceiling for beginners here. ` +
      `Waves this size break with enough force to hold you under, and the rips ` +
      `that drain them are strong enough to carry you out faster than you can paddle. ` +
      `Pick a smaller day or a spot with a gentler bank.`,
  };
}
