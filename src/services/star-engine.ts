import { MarineForecast } from './marine-api';
import type { Basin } from './basins';

export type SkillLevel = 'beginner' | 'intermediate' | 'expert';

export interface SpotConfig {
  swellWindow: { minAngle: number; maxAngle: number };
  offshoreWindAngle: number;
  windTolerance: number;
  idealHeight: Record<SkillLevel, { min: number; max: number }>;
}

export interface StarRatingResult {
  /** Surf quality 0-10 for this hour, wind included. Independent of skill level. */
  stars: number;
  /** What the swell alone would score if the wind were perfect. Never below `stars`. */
  swellStars: number;
  /** Total wave energy in kJ, on surf-forecast's scale. Null when unrated. */
  energyKj: number | null;
  /** Estimated breaking wave height in metres. Null when unrated. */
  breakingHeightM: number | null;
  safety: {
    isDangerous: boolean;
    reason: string | null;
  };
  /** True when there is no wave data to rate. Distinct from a flat 0. */
  unrated: boolean;
}

/**
 * How the rating works, and why.
 *
 * The rating measures the surf, not how well it suits the viewer. That is how
 * surf-forecast, Magicseaweed and Surfline all rate. The previous engine scored
 * "is the height inside your level's comfort range", which gave 0.3 m at 3 s
 * with offshore wind 8/10 for an intermediate and 10/10 for a beginner -- the
 * same as 1.5 m at 12 s. Skill level now only drives the safety alert.
 *
 * Pipeline: wave energy per component (direction-weighted) -> log-scaled,
 * gamma-curved base -> period quality -> wind (gust-aware).
 *
 * The structure follows what surf-forecast, Magicseaweed and Surfline publish
 * about their ratings. None of them publishes a formula, so the numbers are
 * fitted to surf-forecast's actual output: 206 time slots at 10 spots, with
 * leave-one-spot-out validation giving a mean error of 0.50 stars and 96% of
 * slots within one star. Re-run scripts/calibrate-rating.mjs to refit; the
 * benchmark is in openspec/changes/archive/*-calibrate-rating-to-surf-forecast.
 */

/**
 * kJ = ENERGY_COEFFICIENT * H^2 * T^2. Fitted to 26 surf-forecast time slots:
 * 2.5 m @ 14 s publishes 2,323 kJ, the formula gives 2,328.
 */
const ENERGY_COEFFICIENT = 1.9;

interface EnergyScale {
  /** Below this the sea is flat for surfing purposes. */
  flatKj: number;
  /** Energy that maps to a 10. */
  topKj: number;
  /** >1 compresses the low and middle of the scale. */
  gamma: number;
  /** Multipliers for short periods, checked in ascending order of `under`. */
  period: Array<{ under: number; factor: number }>;
}

/**
 * Energy scales per basin. Wind handling is shared: the sea's energy changes
 * between basins, what wind does to a wave does not.
 */
const SCALES: Record<Basin, EnergyScale> = {
  /**
   * Fitted to surf-forecast's ratings (see header). Change only by refitting.
   * Flat fitted at 51 kJ; their FAQ says ~100 kJ is "just about surfable".
   */
  atlantic: {
    flatKj: 51.27,
    topKj: 31764,
    gamma: 1.41,
    period: [
      { under: 6, factor: 0.48 },
      { under: 8, factor: 0.69 },
      { under: 10, factor: 0.71 },
    ],
  },
  /**
   * No reference service rates the Mediterranean on its own terms, so this is
   * anchored to local expertise: 1 m @ 7 s glassy or cross-off is a 2-3 day,
   * 1.5 m @ 8 s glassy a 5-6 day. 5-8 s is the normal Mediterranean period, so
   * only very short wind chop is penalised.
   */
  mediterranean: {
    flatKj: 5,
    topKj: 1500,
    gamma: 1.6,
    period: [
      { under: 5, factor: 0.6 },
      { under: 6, factor: 0.85 },
    ],
  },
};

/** Beyond the window edge, energy fades linearly to this floor over this many degrees. */
const OFF_WINDOW_FLOOR = 0.1;
const OFF_WINDOW_FADE_DEG = 45;

/** Below this, wind has no effect in any direction. */
const LIGHT_WIND_KMH = 7.08;
/** Onshore wind speed at which the sea is blown out. */
const ONSHORE_BLOWOUT_KMH = 19.28;
/** Cross-shore wind speed at which the sea is blown out. */
const CROSS_BLOWOUT_KMH = 30.1;
/**
 * Median gust-to-mean ratio on the coast, measured in Open-Meteo at 7 points
 * over 7 days (IQR 1.65-1.91). Dividing gusts by it means a normally gusty hour
 * scores exactly as calibrated on mean wind, and only unusually gusty hours
 * lose more -- Magicseaweed's point that gusts matter more than the mean.
 */
const TYPICAL_GUST_RATIO = 1.77;
/** Above this, wind degrades the surf whatever its direction... */
const STRONG_WIND_KMH = 45;
/** ...reaching zero this many km/h later. */
const STRONG_WIND_SPAN_KMH = 30;

/** Commonly cited ceiling for beginners: roughly chest-to-head high on the face. */
const BEGINNER_BREAKING_CEILING_M = 1.5;
const GRAVITY = 9.81;

interface Component {
  heightM: number;
  periodS: number;
  directionDeg: number | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Shortest angular distance between two bearings, 0-180. */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function componentsOf(forecast: MarineForecast): Component[] {
  const candidates: Array<[number | null, number | null, number | null]> = [
    [forecast.swellHeight, forecast.swellPeriod, forecast.swellDirection],
    [forecast.secondarySwellHeight, forecast.secondarySwellPeriod, forecast.secondarySwellDirection],
    [forecast.windWaveHeight, forecast.windWavePeriod, forecast.windWaveDirection],
  ];

  return candidates
    .filter(([h, t]) => h !== null && t !== null && h > 0 && t > 0)
    .map(([h, t, d]) => ({ heightM: h as number, periodS: t as number, directionDeg: d }));
}

export function energyKj(heightM: number, periodS: number): number {
  return ENERGY_COEFFICIENT * heightM ** 2 * periodS ** 2;
}

/**
 * 1 inside the swell window, fading to a floor outside it. Never 0: swell
 * refracts around headlands and still delivers some energy.
 */
export function directionFactor(
  directionDeg: number | null,
  window: SpotConfig['swellWindow']
): number {
  // Unknown direction cannot be penalised without inventing one.
  if (directionDeg === null) return 1;

  const { minAngle, maxAngle } = window;
  // A full-circle window is stored with equal edges.
  if (minAngle === maxAngle) return 1;

  const inside =
    minAngle < maxAngle
      ? directionDeg >= minAngle && directionDeg <= maxAngle
      : directionDeg >= minAngle || directionDeg <= maxAngle;
  if (inside) return 1;

  const beyond = Math.min(angularDistance(directionDeg, minAngle), angularDistance(directionDeg, maxAngle));
  if (beyond >= OFF_WINDOW_FADE_DEG) return OFF_WINDOW_FLOOR;
  return 1 - (1 - OFF_WINDOW_FLOOR) * (beyond / OFF_WINDOW_FADE_DEG);
}

/** Short-period sea is disorganised, not just weaker. Cut-offs depend on the basin. */
export function periodFactor(periodS: number, basin: Basin = 'atlantic'): number {
  for (const { under, factor } of SCALES[basin].period) {
    if (periodS < under) return factor;
  }
  return 1;
}

/**
 * Log-scaled, gamma-curved energy to 0-10. Monotonic: surf-forecast does not
 * mark big days down for closing out, so neither does this.
 */
export function energyScore(energy: number, basin: Basin = 'atlantic'): number {
  const { flatKj, topKj, gamma } = SCALES[basin];
  if (energy < flatKj) return 0;

  const ratio = Math.log(energy / flatKj) / Math.log(topKj / flatKj);
  return 10 * Math.min(1, Math.max(0, ratio)) ** gamma;
}

/**
 * 1 when wind does no harm, 0 when it blows the surf out. Onshore wind hurts
 * far more than cross-shore; offshore of moderate strength does not hurt at all.
 * No bonus for offshore: 10 is already the ceiling, and multiplying a saturated
 * score was part of the original bug.
 */
/** Mean wind, raised only when gusts run above their usual ratio to it. */
export function effectiveWindKmh(meanKmh: number | null, gustKmh: number | null): number | null {
  if (meanKmh === null) return null;
  if (gustKmh === null) return meanKmh;
  return Math.max(meanKmh, gustKmh / TYPICAL_GUST_RATIO);
}

export function windFactor(
  speedKmh: number | null,
  fromDeg: number | null,
  offshoreWindAngle: number
): number {
  if (speedKmh === null || fromDeg === null) return 1;
  if (speedKmh < LIGHT_WIND_KMH) return 1;

  // The spot faces the reciprocal of its offshore direction. Wind *from* that
  // bearing comes off the sea: onshore.
  const facing = (offshoreWindAngle + 180) % 360;
  const rad = ((fromDeg - facing) * Math.PI) / 180;

  const onshore = speedKmh * Math.max(0, Math.cos(rad));
  const cross = speedKmh * Math.abs(Math.sin(rad));

  let factor = 1 - onshore / ONSHORE_BLOWOUT_KMH - cross / CROSS_BLOWOUT_KMH;

  if (speedKmh > STRONG_WIND_KMH) {
    factor *= Math.max(0, 1 - (speedKmh - STRONG_WIND_KMH) / STRONG_WIND_SPAN_KMH);
  }

  return Math.min(1, Math.max(0, factor));
}

/** Komar & Gaughan (1972): breaker height from deep-water height and period. */
export function breakingHeightM(heightM: number, periodS: number): number {
  return 0.39 * GRAVITY ** 0.2 * (periodS * heightM ** 2) ** 0.4;
}

const UNRATED: StarRatingResult = {
  stars: 0,
  swellStars: 0,
  energyKj: null,
  breakingHeightM: null,
  safety: { isDangerous: false, reason: null },
  unrated: true,
};

export function calculateStarRating(
  forecast: MarineForecast,
  config: SpotConfig,
  level: SkillLevel,
  spotName = 'this spot',
  basin: Basin = 'atlantic'
): StarRatingResult {
  const components = componentsOf(forecast);
  if (components.length === 0) return UNRATED;

  const energies = components.map(c => energyKj(c.heightM, c.periodS));
  const totalEnergy = energies.reduce((sum, e) => sum + e, 0);

  // What actually reaches the spot: each component weighted by its direction.
  const deliveredEnergy = components.reduce(
    (sum, c, i) => sum + energies[i] * directionFactor(c.directionDeg, config.swellWindow),
    0
  );

  const weightedPeriod =
    components.reduce((sum, c, i) => sum + c.periodS * energies[i], 0) / totalEnergy;
  const combinedHeight = Math.sqrt(components.reduce((sum, c) => sum + c.heightM ** 2, 0));

  const swellScore = energyScore(deliveredEnergy, basin) * periodFactor(weightedPeriod, basin);
  const wind = windFactor(
    effectiveWindKmh(forecast.windSpeed, forecast.windGust ?? null),
    forecast.windDirection,
    config.offshoreWindAngle
  );

  const swellStars = Math.round(swellScore);
  // Round the product rather than the parts, then never exceed the potential.
  const stars = Math.min(swellStars, Math.round(swellScore * wind));

  const breaking = breakingHeightM(combinedHeight, weightedPeriod);

  return {
    stars,
    swellStars,
    energyKj: Math.round(totalEnergy),
    breakingHeightM: round1(breaking),
    safety: assessSafety(breaking, config.idealHeight, level, spotName),
    unrated: false,
  };
}

/**
 * Judged on breaking height, not deep-water height: at the same height a long
 * period breaks far bigger. 1.2 m at 14 s breaks around 2 m, which the old
 * deep-water check waved through for a beginner.
 */
function assessSafety(
  breaking: number,
  idealHeight: SpotConfig['idealHeight'],
  level: SkillLevel,
  spotName: string
): StarRatingResult['safety'] {
  const ceiling = Math.max(idealHeight.beginner.max, BEGINNER_BREAKING_CEILING_M);

  if (level !== 'beginner' || breaking <= ceiling) {
    return { isDangerous: false, reason: null };
  }

  return {
    isDangerous: true,
    reason:
      `Waves at ${spotName} are expected to break around ${breaking.toFixed(1)}m, ` +
      `above the ${ceiling.toFixed(1)}m ceiling for beginners. ` +
      `Waves this size break with enough force to hold you under, and the rips ` +
      `that drain them are strong enough to carry you out faster than you can paddle. ` +
      `Pick a smaller day or a spot with a gentler bank.`,
  };
}
