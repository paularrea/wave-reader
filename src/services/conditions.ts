/**
 * The single source of truth for how conditions are coloured.
 *
 * Both the map markers and the detail drawer read from here, because they used
 * to disagree: the drawer was already yellow while the markers still rendered
 * mid-range spots in mint green, which reads as "good" when it means "mediocre".
 */

import { MarineForecast } from './marine-api';

/**
 * Quality is encoded in several channels at once -- fill, size, ring and glow --
 * not in opacity alone.
 *
 * A single hue ramped only by opacity is unreadable on a dark map: a 4-star and
 * a 7-star spot differ by a few percent of alpha against near-black, which is
 * below what the eye resolves at 20px. Separating the tiers by size and weight
 * as well means the map answers "where should I go today" at a glance, before
 * any number is read.
 */

export type QualityTier = 'epic' | 'good' | 'poor' | 'danger' | 'unrated';

export interface QualityStyle {
  tier: QualityTier;
  /** Marker fill. */
  background: string;
  /** Marker diameter in px. */
  size: number;
  border: string;
  boxShadow: string;
  /** Text colour for the score printed inside the marker, if shown. */
  foreground: string;
  /** Poor and unrated spots stay as plain dots: the number is noise there. */
  showScore: boolean;
  /** Short human label, used by the legend and the drawer. */
  label: string;
}

export const MAX_STARS = 10;

/**
 * On surf-forecast's scale, which the rating is calibrated to: one star is
 * already "good surf" in their own interface, and in the benchmark no ordinary
 * spot went above 4 -- scores of 5 to 9 only appeared at the best spot in the
 * world for each time slot.
 */
export const EPIC_THRESHOLD = 5;
const GOOD_THRESHOLD = 1;

const STYLES: Record<QualityTier, Omit<QualityStyle, 'tier'>> = {
  // Saturated, large, ringed and glowing: impossible to miss among the rest.
  epic: {
    background: '#FBBF24',
    size: 30,
    border: '2px solid #FFFFFF',
    boxShadow: '0 0 0 4px rgba(251,191,36,0.28), 0 0 14px 2px rgba(251,191,36,0.45)',
    foreground: '#422006',
    showScore: true,
    label: 'Epic',
  },
  // Clearly present but visibly secondary to epic: darker, smaller, no glow.
  good: {
    background: '#B45309',
    size: 22,
    border: '1.5px solid rgba(255,255,255,0.7)',
    boxShadow: 'none',
    foreground: '#FEF3C7',
    showScore: true,
    label: 'Fair',
  },
  // Recedes into the map. Present, findable, never competing for attention.
  poor: {
    background: '#52525B',
    size: 11,
    border: '1px solid rgba(255,255,255,0.28)',
    boxShadow: 'none',
    foreground: 'transparent',
    showScore: false,
    label: 'Poor',
  },
  // Red overrides the quality ramp entirely: this is a safety signal, not a
  // rating, and it must read as "stop" even on a spot scoring well.
  danger: {
    background: '#EF4444',
    size: 26,
    border: '3px solid #FCA5A5',
    boxShadow: '0 0 0 3px rgba(239,68,68,0.3), 0 0 16px 3px rgba(239,68,68,0.6)',
    foreground: '#FFFFFF',
    showScore: true,
    label: 'Above your level',
  },
  // Hollow, so "no forecast" never looks like "bad forecast".
  unrated: {
    background: 'transparent',
    size: 11,
    border: '1.5px dashed rgba(161,161,170,0.8)',
    boxShadow: 'none',
    foreground: 'transparent',
    showScore: false,
    label: 'No data',
  },
};

export function qualityTier(
  stars: number,
  options?: { isDangerous?: boolean; unrated?: boolean }
): QualityTier {
  if (options?.unrated) return 'unrated';
  if (options?.isDangerous) return 'danger';
  if (stars >= EPIC_THRESHOLD) return 'epic';
  if (stars >= GOOD_THRESHOLD) return 'good';
  return 'poor';
}

export function qualityStyle(
  stars: number,
  options?: { isDangerous?: boolean; unrated?: boolean }
): QualityStyle {
  const tier = qualityTier(stars, options);
  return { tier, ...STYLES[tier] };
}

/** The tiers a legend should list, in reading order. */
export const LEGEND_TIERS: QualityTier[] = ['epic', 'good', 'poor', 'danger'];

export function legendEntry(tier: QualityTier): QualityStyle & { range: string } {
  const span = (from: number, to: number) => (from === to ? String(from) : `${from}-${to}`);
  const ranges: Record<QualityTier, string> = {
    epic: span(EPIC_THRESHOLD, MAX_STARS),
    good: span(GOOD_THRESHOLD, EPIC_THRESHOLD - 1),
    poor: span(0, GOOD_THRESHOLD - 1),
    danger: '!',
    unrated: '--',
  };
  return { tier, ...STYLES[tier], range: ranges[tier] };
}

/** Fill colour alone, for surfaces that only need the hue. */
export function qualityColor(
  stars: number,
  options?: { isDangerous?: boolean; unrated?: boolean }
): string {
  return qualityStyle(stars, options).background;
}

export type WindCategory = 'Glass' | 'Off-shore' | 'Cross-shore' | 'On-shore';

export interface WindBadge {
  label: WindCategory;
  /** Background colour. Grey for onshore, greens for the rest. */
  background: string;
  foreground: string;
}

// Tinted, not filled: the wind qualifies the reading, it must not outshout the score.
const WIND_BADGES: Record<WindCategory, Omit<WindBadge, 'label'>> = {
  'Glass': { background: 'rgba(74,222,128,0.16)', foreground: '#86EFAC' },
  'Off-shore': { background: 'rgba(74,222,128,0.12)', foreground: '#86EFAC' },
  'Cross-shore': { background: 'rgba(190,242,100,0.10)', foreground: '#D9F99D' },
  'On-shore': { background: 'rgba(161,161,170,0.14)', foreground: '#D4D4D8' },
};

/** Wind below this is glass-off regardless of direction. */
const GLASS_THRESHOLD_KMH = 5;

/** Shortest angular distance between two bearings, 0-180. */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

/**
 * Returns `null` when wind is unknown. A missing reading must not fall through
 * to `Glass`, which is what the old `null -> 0 km/h` coercion produced.
 */
export function windBadge(
  forecast: Pick<MarineForecast, 'windSpeed' | 'windDirection'>,
  config: { offshoreWindAngle: number; windTolerance: number }
): WindBadge | null {
  const { windSpeed, windDirection } = forecast;
  if (windSpeed === null) return null;

  if (windSpeed < GLASS_THRESHOLD_KMH) {
    return { label: 'Glass', ...WIND_BADGES['Glass'] };
  }
  if (windDirection === null) return null;

  const offshoreDistance = angularDistance(windDirection, config.offshoreWindAngle);
  if (offshoreDistance <= config.windTolerance) {
    return { label: 'Off-shore', ...WIND_BADGES['Off-shore'] };
  }
  if (offshoreDistance > 180 - config.windTolerance) {
    return { label: 'On-shore', ...WIND_BADGES['On-shore'] };
  }
  return { label: 'Cross-shore', ...WIND_BADGES['Cross-shore'] };
}

/** Light blue for small surf through to dark blue for heavy surf. */
const SWELL_RAMP: Array<{ maxHeight: number; color: string }> = [
  { maxHeight: 0.5, color: '#BFDBFE' }, // blue-200
  { maxHeight: 1.0, color: '#93C5FD' }, // blue-300
  { maxHeight: 1.5, color: '#60A5FA' }, // blue-400
  { maxHeight: 2.5, color: '#3B82F6' }, // blue-500
  { maxHeight: 3.5, color: '#2563EB' }, // blue-600
  { maxHeight: 5.0, color: '#1D4ED8' }, // blue-700
  { maxHeight: Infinity, color: '#1E3A8A' }, // blue-900
];

export function swellColor(height: number | null): string {
  if (height === null) return '#52525B';
  return SWELL_RAMP.find(step => height < step.maxHeight)!.color;
}

/** `NE`, `SSW`, ... from a bearing in degrees. */
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassPoint(degrees: number | null): string | null {
  if (degrees === null) return null;
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

/** `12 km/h NW` — never renders a unit next to a missing number. */
export function formatWind(speed: number | null, direction: number | null): string {
  if (speed === null) return 'No data';
  const point = compassPoint(direction);
  return point ? `${Math.round(speed)} km/h ${point}` : `${Math.round(speed)} km/h`;
}
