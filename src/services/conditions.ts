/**
 * The single source of truth for how conditions are coloured.
 *
 * Both the map markers and the detail drawer read from here, because they used
 * to disagree: the drawer was already yellow while the markers still rendered
 * mid-range spots in mint green, which reads as "good" when it means "mediocre".
 */

import { MarineForecast } from './marine-api';
import { CALM_WIND_KMH } from './star-engine';
import type { Theme } from './theme';

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
 * On the surfability scale (see star-engine): 1 m at 10 s clean is a 5, so
 * "epic" has to start above that or every ordinary fun day paints the map
 * yellow and the colour stops meaning anything. 6 is 1.2 m at 10 s clean, the
 * point at which a surfer changes plans to go.
 */
export const EPIC_THRESHOLD = 6;
const GOOD_THRESHOLD = 1;

/** What a tier looks like whatever the theme: its weight on the map and its name. */
const SHAPES: Record<QualityTier, Pick<QualityStyle, 'size' | 'showScore' | 'label'>> = {
  epic: { size: 30, showScore: true, label: 'Epic' },
  good: { size: 22, showScore: true, label: 'Fair' },
  poor: { size: 11, showScore: false, label: 'Poor' },
  danger: { size: 26, showScore: true, label: 'Above your level' },
  unrated: { size: 11, showScore: false, label: 'No data' },
};

type TierColours = Pick<QualityStyle, 'background' | 'border' | 'boxShadow' | 'foreground'>;

/**
 * The same hues in both themes; only what separates a marker from the map
 * changes. A glow reads on a dark map and vanishes on a light one, so there
 * epic keeps its white ring and gains a thin dark outline and a shadow.
 */
const COLOURS: Record<Theme, Record<QualityTier, TierColours>> = {
  dark: {
    // Saturated, large, ringed and glowing: impossible to miss among the rest.
    epic: {
      background: '#FBBF24',
      border: '2px solid #FFFFFF',
      boxShadow: '0 0 0 4px rgba(251,191,36,0.28), 0 0 14px 2px rgba(251,191,36,0.45)',
      foreground: '#422006',
    },
    // Clearly present but visibly secondary to epic: darker, smaller, no glow.
    good: {
      background: '#B45309',
      border: '1.5px solid rgba(255,255,255,0.7)',
      boxShadow: 'none',
      foreground: '#FEF3C7',
    },
    // Recedes into the map. Present, findable, never competing for attention.
    poor: {
      background: '#52525B',
      border: '1px solid rgba(255,255,255,0.28)',
      boxShadow: 'none',
      foreground: 'transparent',
    },
    // Red overrides the quality ramp entirely: this is a safety signal, not a
    // rating, and it must read as "stop" even on a spot scoring well.
    danger: {
      background: '#EF4444',
      border: '3px solid #FCA5A5',
      boxShadow: '0 0 0 3px rgba(239,68,68,0.3), 0 0 16px 3px rgba(239,68,68,0.6)',
      foreground: '#FFFFFF',
    },
    // Hollow, so "no forecast" never looks like "bad forecast".
    unrated: {
      background: 'transparent',
      border: '1.5px dashed rgba(161,161,170,0.8)',
      boxShadow: 'none',
      foreground: 'transparent',
    },
  },
  light: {
    epic: {
      background: '#FBBF24',
      border: '2px solid #FFFFFF',
      boxShadow: '0 0 0 1.5px rgba(120,53,15,0.55), 0 3px 10px rgba(180,83,9,0.35)',
      foreground: '#422006',
    },
    good: {
      background: '#B45309',
      border: '1.5px solid #FFFFFF',
      boxShadow: '0 1px 3px rgba(15,23,29,0.3)',
      foreground: '#FEF3C7',
    },
    // A white ring rather than a dark one: grey on light grey needs the edge.
    poor: {
      background: '#A1A1AA',
      border: '1.5px solid #FFFFFF',
      boxShadow: '0 0 0 0.5px rgba(15,23,29,0.3)',
      foreground: 'transparent',
    },
    danger: {
      background: '#EF4444',
      border: '2px solid #FFFFFF',
      boxShadow: '0 0 0 2px rgba(239,68,68,0.55), 0 3px 12px rgba(239,68,68,0.45)',
      foreground: '#FFFFFF',
    },
    unrated: {
      background: 'transparent',
      border: '1.5px dashed rgba(82,82,91,0.7)',
      boxShadow: 'none',
      foreground: 'transparent',
    },
  },
};

function styleFor(tier: QualityTier, theme: Theme): Omit<QualityStyle, 'tier'> {
  return { ...SHAPES[tier], ...COLOURS[theme][tier] };
}

interface StyleOptions {
  isDangerous?: boolean;
  unrated?: boolean;
  /** Defaults to dark, the theme the scale was designed on. */
  theme?: Theme;
}

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

export function qualityStyle(stars: number, options?: StyleOptions): QualityStyle {
  const tier = qualityTier(stars, options);
  return { tier, ...styleFor(tier, options?.theme ?? 'dark') };
}

/** The tiers a legend should list, in reading order. */
export const LEGEND_TIERS: QualityTier[] = ['epic', 'good', 'poor', 'danger'];

export function legendEntry(tier: QualityTier, theme: Theme = 'dark'): QualityStyle & { range: string } {
  const span = (from: number, to: number) => (from === to ? String(from) : `${from}-${to}`);
  const ranges: Record<QualityTier, string> = {
    epic: span(EPIC_THRESHOLD, MAX_STARS),
    good: span(GOOD_THRESHOLD, EPIC_THRESHOLD - 1),
    poor: span(0, GOOD_THRESHOLD - 1),
    danger: '!',
    unrated: '--',
  };
  return { tier, ...styleFor(tier, theme), range: ranges[tier] };
}

/** Fill colour alone, for surfaces that only need the hue. */
export function qualityColor(stars: number, options?: StyleOptions): string {
  return qualityStyle(stars, options).background;
}

export type WindCategory = 'Glass' | 'Light' | 'Offshore' | 'Cross-shore' | 'Onshore';

export interface WindBadge {
  label: WindCategory;
  /** Background colour. Grey for onshore, greens for the rest. */
  background: string;
  foreground: string;
}

// Tinted, not filled: the wind qualifies the reading, it must not outshout the score.
// On white the pale greens that read on near-black disappear, so the light
// theme uses the same hues a few steps darker.
const WIND_BADGES: Record<Theme, Record<WindCategory, Omit<WindBadge, 'label'>>> = {
  dark: {
    'Glass': { background: 'rgba(74,222,128,0.16)', foreground: '#86EFAC' },
    // Same green as Glass on purpose: green means "the wind costs nothing".
    'Light': { background: 'rgba(74,222,128,0.16)', foreground: '#86EFAC' },
    'Offshore': { background: 'rgba(74,222,128,0.12)', foreground: '#86EFAC' },
    'Cross-shore': { background: 'rgba(190,242,100,0.10)', foreground: '#D9F99D' },
    'Onshore': { background: 'rgba(161,161,170,0.14)', foreground: '#D4D4D8' },
  },
  light: {
    'Glass': { background: 'rgba(22,163,74,0.13)', foreground: '#15803D' },
    'Light': { background: 'rgba(22,163,74,0.13)', foreground: '#15803D' },
    'Offshore': { background: 'rgba(22,163,74,0.10)', foreground: '#15803D' },
    'Cross-shore': { background: 'rgba(101,163,13,0.14)', foreground: '#4D7C0F' },
    'Onshore': { background: 'rgba(113,113,122,0.14)', foreground: '#52525B' },
  },
};

/**
 * Wind below this is glass-off regardless of direction. Presentation only: it
 * sits inside CALM_WIND_KMH, below which the rating ignores the wind anyway.
 */
const GLASS_THRESHOLD_KMH = 5;

/** Shortest angular distance between two bearings, 0-180. */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

/**
 * Returns `null` when wind is unknown. A missing reading must not fall through
 * to `Glass`, which is what the old `null -> 0 km/h` coercion produced.
 *
 * Under CALM_WIND_KMH the badge is `Light` whatever the direction, because the
 * rating does not charge for it: a grey `Onshore` on an hour that loses nothing
 * to the wind was one of the contradictions that made the score untrustworthy.
 */
export function windBadge(
  forecast: Pick<MarineForecast, 'windSpeed' | 'windDirection'>,
  config: { offshoreWindAngle: number; windTolerance: number },
  theme: Theme = 'dark'
): WindBadge | null {
  const { windSpeed, windDirection } = forecast;
  if (windSpeed === null) return null;
  const badges = WIND_BADGES[theme];

  if (windSpeed < GLASS_THRESHOLD_KMH) {
    return { label: 'Glass', ...badges['Glass'] };
  }
  if (windSpeed < CALM_WIND_KMH) {
    return { label: 'Light', ...badges['Light'] };
  }
  const direction = windDirectionClass(windDirection, config);
  if (direction === null) return null;
  const label: WindCategory =
    direction === 'offshore' ? 'Offshore' : direction === 'onshore' ? 'Onshore' : 'Cross-shore';
  return { label, ...badges[label] };
}

export type WindDirectionClass = 'offshore' | 'cross-shore' | 'onshore';

/** Where the wind blows from relative to the spot, whatever its strength. */
export function windDirectionClass(
  windDirection: number | null,
  config: { offshoreWindAngle: number; windTolerance: number }
): WindDirectionClass | null {
  if (windDirection === null) return null;
  const offshoreDistance = angularDistance(windDirection, config.offshoreWindAngle);
  if (offshoreDistance <= config.windTolerance) return 'offshore';
  if (offshoreDistance > 180 - config.windTolerance) return 'onshore';
  return 'cross-shore';
}

/**
 * Light blue for small surf through to dark blue for heavy surf. The light
 * theme starts where the pale end is still legible on white.
 */
const SWELL_STEPS = [0.5, 1.0, 1.5, 2.5, 3.5, 5.0, Infinity];
const SWELL_RAMP: Record<Theme, string[]> = {
  // blue-200 .. blue-900
  dark: ['#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#1E3A8A'],
  // blue-500 .. blue-950
  light: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A', '#172554', '#0F1A3D'],
};

export function swellColor(height: number | null, theme: Theme = 'dark'): string {
  if (height === null) return theme === 'dark' ? '#52525B' : '#A1A1AA';
  return SWELL_RAMP[theme][SWELL_STEPS.findIndex(max => height < max)];
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
