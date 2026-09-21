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
  /** Total wave energy in kJ. Null when unrated. */
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
 * Pipeline: wave energy per component (direction-weighted) -> anchored energy
 * scale -> period quality -> wind (mean speed, continuous above calm).
 *
 * The scale measures **surfability**, and deliberately no longer reproduces
 * surf-forecast's stars. Theirs is a global scale — it spreads 0-10 over every
 * break on the planet, so 1.4 m at 10 s clean scores 0-2 in their own tables,
 * and only the best spot in the world in a given slot reaches 5+. This app
 * answers a different question: is today worth the drive to this beach. So the
 * physics is unchanged and only the energy-to-score curve moved, to anchors a
 * surfer recognises without a table (see SCALES). The previous fit to
 * surf-forecast (206 slots, 10 spots, mean error 0.50 stars) and its benchmark
 * live in openspec/changes/archive/*-calibrate-rating-to-surf-forecast, and
 * scripts/calibrate-rating.mjs still reproduces it; neither defines the scale
 * any more.
 */

/**
 * kJ = ENERGY_COEFFICIENT * H^2 * T^2. Fitted to 26 surf-forecast time slots:
 * 2.5 m @ 14 s publishes 2,323 kJ, the formula gives 2,328.
 */
const ENERGY_COEFFICIENT = 1.9;

interface EnergyScale {
  /**
   * Energy in kJ to score, ascending. Below the first entry the sea is flat;
   * above the last it is a 10. Between them the score interpolates in the
   * logarithm of the energy, which is where a surfer's sense of size is linear.
   */
  anchors: Array<readonly [kj: number, score: number]>;
  /**
   * Short-period multiplier as points [periodS, factor], ascending, joined by
   * straight lines and held flat beyond both ends. The last point sits at the
   * period the anchors are written for, so an anchor scores what it declares.
   */
  period: Array<readonly [periodS: number, factor: number]>;
}

/**
 * Energy scales per basin. Wind handling is shared: the sea's energy changes
 * between basins, what wind does to a wave does not.
 *
 * Anchors are written for clean seas at a period that carries no penalty, so
 * each anchor is the score those conditions actually get.
 */
const SCALES: Record<Basin, EnergyScale> = {
  /**
   * 0.6 m @ 10 s barely worth it, 1 m @ 10 s a fun small day, 1.4 m @ 10 s a
   * good one, 2 m @ 12 s excellent. The top saturates on purpose: 2.5 m @ 14 s
   * and 4 m @ 18 s are both a 10, because the question this app answers is
   * whether today is worth the drive, not how this swell ranks worldwide.
   */
  atlantic: {
    anchors: [
      [45, 0],
      [70, 1],
      [122, 3],
      [190, 5],
      [372, 7],
      [1094, 9],
      [2400, 10],
    ],
    // Each point sits mid-way along the step it replaced: a 0.2 s difference
    // at 10 s used to be worth three stars.
    period: [
      [5, 0.48],
      [7, 0.69],
      [9, 0.71],
      [10, 1],
    ],
  },
  /**
   * No reference service rates the Mediterranean on its own terms, so this is
   * anchored to local expertise: 0.8 m @ 7 s clean is worth paddling out for,
   * 1 m @ 7 s a decent day, 1.5 m @ 8 s a good one. 5-8 s is the normal
   * Mediterranean period; below 5 s it is chop with no wave in it, which the
   * period factor cuts to 0.4 -- enough to keep 1 m of 4-second chop at 0.
   */
  mediterranean: {
    anchors: [
      [20, 0],
      [41, 1],
      [60, 2.5],
      [93, 4],
      [274, 6],
      [616, 8],
      [1200, 10],
    ],
    period: [
      [4.5, 0.4],
      [5.5, 0.8],
      [6, 1],
    ],
  },
};

/** Beyond the window edge, energy fades linearly to this floor over this many degrees. */
const OFF_WINDOW_FLOOR = 0.1;
const OFF_WINDOW_FADE_DEG = 45;

/**
 * Below this mean wind the sea is effectively glassy for surfing, whatever the
 * direction: 2 km/h onshore does not spoil a wave. The wind badge and the
 * verdict read the same constant, so the three can never disagree again.
 */
export const CALM_WIND_KMH = 10;
/** Onshore wind this far above calm blows the sea out (30 km/h). */
const ONSHORE_BLOWOUT_EXCESS_KMH = 20;
/** Cross-shore wind this far above calm blows the sea out (40 km/h). */
const CROSS_BLOWOUT_EXCESS_KMH = 30;
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

/** Short-period sea is disorganised, not just weaker. Continuous in the period. */
export function periodFactor(periodS: number, basin: Basin = 'atlantic'): number {
  const points = SCALES[basin].period;
  const [firstS, firstFactor] = points[0];
  if (periodS <= firstS) return firstFactor;
  for (let i = 1; i < points.length; i++) {
    const [highS, highFactor] = points[i];
    if (periodS <= highS) {
      const [lowS, lowFactor] = points[i - 1];
      return lowFactor + ((periodS - lowS) / (highS - lowS)) * (highFactor - lowFactor);
    }
  }
  return points[points.length - 1][1];
}

/**
 * Energy to 0-10, interpolated between the basin's anchors in log energy.
 * Monotonic: a bigger sea never scores less, so a huge day is never marked
 * down for closing out.
 */
export function energyScore(energy: number, basin: Basin = 'atlantic'): number {
  const { anchors } = SCALES[basin];
  const [floorKj] = anchors[0];
  const [ceilingKj, ceilingScore] = anchors[anchors.length - 1];

  if (energy <= floorKj) return 0;
  if (energy >= ceilingKj) return ceilingScore;

  const upper = anchors.findIndex(([kj]) => kj >= energy);
  const [lowKj, lowScore] = anchors[upper - 1];
  const [highKj, highScore] = anchors[upper];

  const position = Math.log(energy / lowKj) / Math.log(highKj / lowKj);
  return lowScore + position * (highScore - lowScore);
}

/**
 * 1 when wind does no harm, 0 when it blows the surf out. Rated on the mean
 * wind -- the one the app shows -- because gusts never entered a rating the
 * surfer could check: the old max(mean, gust / 1.77) rule was measured only on
 * winds of 8 km/h and more, and near calm it inflated 2 km/h into 15.
 *
 * Only the excess over calm counts, so the factor starts at exactly 1 and falls
 * continuously: no step at the threshold. Onshore hurts more than cross-shore;
 * offshore of moderate strength does not hurt at all. No bonus for offshore:
 * 10 is already the ceiling.
 */
export function windFactor(
  speedKmh: number | null,
  fromDeg: number | null,
  offshoreWindAngle: number
): number {
  if (speedKmh === null || fromDeg === null) return 1;

  const excess = Math.max(0, speedKmh - CALM_WIND_KMH);
  // The spot faces the reciprocal of its offshore direction. Wind *from* that
  // bearing comes off the sea: onshore.
  const facing = (offshoreWindAngle + 180) % 360;
  const rad = ((fromDeg - facing) * Math.PI) / 180;

  const onshore = excess * Math.max(0, Math.cos(rad));
  const cross = excess * Math.abs(Math.sin(rad));

  let factor = 1 - onshore / ONSHORE_BLOWOUT_EXCESS_KMH - cross / CROSS_BLOWOUT_EXCESS_KMH;

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
  const wind = windFactor(forecast.windSpeed, forecast.windDirection, config.offshoreWindAngle);

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
