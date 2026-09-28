/**
 * Wave Reader's identity, direction A ("Instrument"), approved from
 * https://claude.ai/artifact/WFbX8hZoN5b7x94XMXjLmc.
 *
 * The mark is the app's own pill timeline: five 3-hour slots, taller with more
 * swell, rising to a peak and falling away like a wave. The tallest is the
 * epic yellow, the one slot worth the drive -- which is why the logo may use
 * the colour reserved for surf quality, and nothing else in the UI may.
 */

export const BRAND = {
  name: 'Wave Reader',
  tagline: 'Read the sea before you drive.',
  description:
    'Surf forecast for Spain, France, Ireland and the UK: swell, wind and tides, and a 0–10 score for every spot.',
} as const;

/** Same yellow as an epic marker. */
export const MARK_ACCENT = '#FBBF24';

/** Bars on a 32-unit grid, 4 wide with fully rounded ends, standing on y = 28. */
export const MARK_BARS: ReadonlyArray<{ x: number; height: number; accent?: boolean }> = [
  { x: 2, height: 8 },
  { x: 8, height: 13 },
  { x: 14, height: 20 },
  { x: 20, height: 24, accent: true },
  { x: 26, height: 11 },
];
