import { test, expect } from '@playwright/test';
import { findTideExtremes, tidesForDay, TideSeries } from '../../src/services/tides';

/** Builds an hourly series from a list of sea levels starting at 00:00. */
function series(day: string, levels: (number | null)[]): TideSeries {
  return {
    time: levels.map((_, i) => `${day}T${String(i).padStart(2, '0')}:00`),
    seaLevel: levels,
  };
}

/** A clean semidiurnal day: two highs and two lows. */
const SEMIDIURNAL = [
  0.0, 0.6, 1.1, 1.4, 1.2, 0.7, 0.1, -0.4, -0.8, -0.5, 0.0, 0.6,
  1.2, 1.5, 1.3, 0.8, 0.2, -0.3, -0.9, -0.6, -0.1, 0.5, 1.0, 1.3,
];

test.describe('spec: tide-extremes / Detección de pleamar y bajamar', () => {
  test('a two-cycle day yields two highs and two lows', () => {
    const extremes = findTideExtremes(series('2026-09-16', SEMIDIURNAL));

    expect(extremes.filter(e => e.kind === 'high')).toHaveLength(2);
    expect(extremes.filter(e => e.kind === 'low')).toHaveLength(2);
    expect(extremes).toHaveLength(4);
  });

  test('extremes are chronological and alternate high/low', () => {
    const extremes = findTideExtremes(series('2026-09-16', SEMIDIURNAL));

    const timestamps = extremes.map(e => e.timestamp);
    expect([...timestamps].sort()).toEqual(timestamps);

    for (let i = 1; i < extremes.length; i++) {
      expect(extremes[i].kind).not.toBe(extremes[i - 1].kind);
    }
  });

  test('the high is reported at the peak hour with its height', () => {
    const extremes = findTideExtremes(series('2026-09-16', SEMIDIURNAL));
    const firstHigh = extremes.find(e => e.kind === 'high')!;

    expect(firstHigh.timestamp).toBe('2026-09-16T03:00');
    expect(firstHigh.heightM).toBeCloseTo(1.4, 5);
  });

  test('noise below the prominence floor is not reported as a tide', () => {
    // A 2 cm wiggle on an otherwise rising limb is model noise, not a turn.
    const noisy = [0.0, 0.2, 0.22, 0.2, 0.4, 0.8, 1.2, 1.5, 1.2, 0.8, 0.4, 0.0];
    const extremes = findTideExtremes(series('2026-09-16', noisy));

    expect(extremes.map(e => e.timestamp)).not.toContain('2026-09-16T02:00');
  });

  test('a flat peak reports exactly one extreme', () => {
    const plateau = [0.0, 0.5, 1.2, 1.2, 1.2, 0.5, 0.0];
    const extremes = findTideExtremes(series('2026-09-16', plateau));

    expect(extremes.filter(e => e.kind === 'high')).toHaveLength(1);
  });

  test('gaps in the series do not produce extremes', () => {
    const gappy = [0.0, null, null, 1.4, null, 0.2];
    expect(() => findTideExtremes(series('2026-09-16', gappy))).not.toThrow();
  });
});

test.describe('spec: tide-extremes / Las mareas siguen al día seleccionado', () => {
  test('only the requested day is returned', () => {
    const twoDays: TideSeries = {
      time: [
        ...SEMIDIURNAL.map((_, i) => `2026-09-16T${String(i).padStart(2, '0')}:00`),
        ...SEMIDIURNAL.map((_, i) => `2026-09-17T${String(i).padStart(2, '0')}:00`),
      ],
      seaLevel: [...SEMIDIURNAL, ...SEMIDIURNAL],
    };

    const today = tidesForDay(twoDays, '2026-09-16');
    const tomorrow = tidesForDay(twoDays, '2026-09-17');

    expect(today.length).toBeGreaterThan(0);
    expect(tomorrow.length).toBeGreaterThan(0);
    expect(today.every(t => t.timestamp.startsWith('2026-09-16'))).toBe(true);
    expect(tomorrow.every(t => t.timestamp.startsWith('2026-09-17'))).toBe(true);
  });

  test('a day with no sea-level data returns nothing rather than inventing tides', () => {
    expect(tidesForDay(series('2026-09-16', SEMIDIURNAL), '2026-09-20')).toEqual([]);
  });
});
