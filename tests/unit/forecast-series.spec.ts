import { test, expect } from '@playwright/test';
import {
  buildTimeline,
  pillColour,
  pillHeightPx,
  slotContaining,
  PILL_MAX_PX,
  PILL_MIN_PX,
  SeriesHour,
} from '../../src/services/forecast-series';

const MADRID = 2 * 3600;

/** Hourly entries from a local start key, as the series route returns them. */
function hoursFrom(startKey: string, count: number, stars: (i: number) => number = () => 0): SeriesHour[] {
  const start = Date.parse(`${startKey}:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const key = new Date(start + i * 3_600_000).toISOString().slice(0, 13) + ':00';
    return {
      stars: stars(i),
      swellStars: stars(i),
      energyKj: 100,
      breakingHeightM: 1,
      unrated: false,
      safety: { isDangerous: false, reason: null },
      forecast: {
        timestamp: key,
        swellHeight: 1,
        swellPeriod: 8,
        swellDirection: 300,
        secondarySwellHeight: null,
        secondarySwellPeriod: null,
        secondarySwellDirection: null,
        windWaveHeight: null,
        windWavePeriod: null,
        windWaveDirection: null,
        windSpeed: 5,
        windDirection: 90,
        seaLevel: null,
      },
    };
  });
}

test.describe('pill timeline', () => {
  const now = new Date('2026-09-16T12:20:00Z'); // 14:20 in Madrid, anchor 15:00

  test('groups hours into 3-hour slots per local day, today starting at the anchor', () => {
    const days = buildTimeline(hoursFrom('2026-09-16T15', 169), MADRID, now);

    expect(days[0].label).toBe('Today');
    expect(days[0].startHour).toBe(0);
    // 15, 18, 21: the slots before the anchor are in the past and not drawn.
    expect(days[0].slots.map(s => s.slotHour)).toEqual([15, 18, 21]);
    expect(days[1].label).toBe('Tmrw');
    expect(days[1].slots).toHaveLength(8);
    expect(days[1].startHour).toBe(9);
  });

  test('a partial slot opens its first available hour', () => {
    const days = buildTimeline(hoursFrom('2026-09-16T16', 30), MADRID, now);
    // 16:00 falls in the 15:00 slot, which opens at 16:00 (offset 0).
    expect(days[0].slots[0]).toMatchObject({ slotHour: 15, hourOffset: 0 });
    expect(days[0].slots[1]).toMatchObject({ slotHour: 18, hourOffset: 2 });
  });

  test('the selected slot is the one containing the hour', () => {
    const days = buildTimeline(hoursFrom('2026-09-16T15', 48), MADRID, now);
    expect(slotContaining(days, 0)?.hourOffset).toBe(0);
    expect(slotContaining(days, 2)?.hourOffset).toBe(0);
    expect(slotContaining(days, 3)?.hourOffset).toBe(3);
    expect(slotContaining(days, 10)?.hourOffset).toBe(9);
  });

  test('pill height grows with swell from 0 to 3 m and stays put above', () => {
    expect(pillHeightPx(0)).toBe(PILL_MIN_PX);
    expect(pillHeightPx(null)).toBe(PILL_MIN_PX);
    expect(pillHeightPx(1.5)).toBeGreaterThan(pillHeightPx(0.5));
    expect(pillHeightPx(3)).toBe(PILL_MAX_PX);
    expect(pillHeightPx(4.5)).toBe(PILL_MAX_PX);
  });

  test('pill colour runs from grey at 0 to yellow at 5 and beyond', () => {
    expect(pillColour(0)).toBe('rgb(82, 82, 91)');
    expect(pillColour(5)).toBe('rgb(251, 191, 36)');
    expect(pillColour(9)).toBe('rgb(251, 191, 36)');
    const [r2, g2, b2] = pillColour(2).match(/\d+/g)!.map(Number);
    expect(r2).toBeGreaterThan(82);
    expect(r2).toBeLessThan(251);
    // Warmer, never greener: green once meant "mediocre" on this app.
    expect(g2).toBeLessThanOrEqual(r2);
    expect(b2).toBeLessThan(91);
    expect(pillColour(7, { isDangerous: true })).toBe('#EF4444');
  });
});
