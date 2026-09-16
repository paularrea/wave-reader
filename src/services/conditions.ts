/**
 * The single source of truth for how conditions are coloured.
 *
 * Both the map markers and the detail drawer read from here, because they used
 * to disagree: the drawer was already yellow while the markers still rendered
 * mid-range spots in mint green, which reads as "good" when it means "mediocre".
 */

import { MarineForecast } from './marine-api';

/** One hue for quality; only opacity carries the score. */
const QUALITY_HUE = '250, 204, 21'; // Tailwind yellow-400
const DANGER_COLOR = '#EF4444'; // red-500
const UNRATED_COLOR = '#52525B'; // zinc-600

export const MAX_STARS = 10;

/**
 * Opacity ramp for a 0-10 score. Starts at 0.15 so a zero-star spot is still
 * visible on the dark map, and reaches full opacity only at a perfect score.
 */
export function qualityOpacity(stars: number): number {
  const clamped = Math.min(MAX_STARS, Math.max(0, stars));
  return Number((0.15 + (clamped / MAX_STARS) * 0.85).toFixed(3));
}

/** `rgba(...)` for a score. Dangerous spots override the ramp entirely. */
export function qualityColor(stars: number, options?: { isDangerous?: boolean; unrated?: boolean }): string {
  if (options?.unrated) return UNRATED_COLOR;
  if (options?.isDangerous) return DANGER_COLOR;
  return `rgba(${QUALITY_HUE}, ${qualityOpacity(stars)})`;
}

export type WindCategory = 'Glass' | 'Off-shore' | 'Cross-shore' | 'On-shore';

export interface WindBadge {
  label: WindCategory;
  /** Background colour. Grey for onshore, greens for the rest. */
  background: string;
  foreground: string;
}

const WIND_BADGES: Record<WindCategory, Omit<WindBadge, 'label'>> = {
  'Glass': { background: '#16A34A', foreground: '#FFFFFF' }, // green-600
  'Off-shore': { background: '#22C55E', foreground: '#052E16' }, // green-500
  'Cross-shore': { background: '#86EFAC', foreground: '#14532D' }, // green-300, light
  'On-shore': { background: '#71717A', foreground: '#FFFFFF' }, // zinc-500, grey
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
  if (height === null) return UNRATED_COLOR;
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
