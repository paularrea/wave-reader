import { test, expect } from '@playwright/test';
import { verdict, bestWindow, periodClass } from '../../src/services/verdict';
import { bestAt, bestByDay, ratingAt, SpotHorizon } from '../../src/services/map-summary';
import type { SeriesHour } from '../../src/services/forecast-series';
import type { MarineForecast } from '../../src/services/marine-api';
import { edgeCacheHeaders } from '../../src/services/http-cache';

const CONFIG = { offshoreWindAngle: 140, windTolerance: 30 };

function forecast(overrides: Partial<MarineForecast> = {}): MarineForecast {
  return {
    timestamp: '2026-09-19T09:00',
    swellHeight: 1.3,
    swellPeriod: 7,
    swellDirection: 300,
    secondarySwellHeight: null,
    secondarySwellPeriod: null,
    secondarySwellDirection: null,
    windWaveHeight: null,
    windWavePeriod: null,
    windWaveDirection: null,
    windSpeed: 8,
    windDirection: 320,
    seaLevel: null,
    ...overrides,
  };
}

test.describe('spec: drawer-navigation / Veredicto y mejor franja', () => {
  test('light onshore wind on a 1.3 m swell is said in words', () => {
    const text = verdict({ stars: 1, swellStars: 2, unrated: false, forecast: forecast() }, CONFIG);
    expect(text).toBe('Surfable: 1.3 m swell at 7 s, light onshore wind.');
  });

  test('clean groundswell reads as excellent with no wind', () => {
    const text = verdict(
      { stars: 6, swellStars: 6, unrated: false, forecast: forecast({ swellHeight: 2.1, swellPeriod: 12, windSpeed: 3 }) },
      CONFIG
    );
    expect(text).toBe('Excellent: 2.1 m groundswell at 12 s, no wind.');
  });

  test('wind that costs the whole score reads as blown out, a tiny sea as flat', () => {
    expect(
      verdict({ stars: 0, swellStars: 3, unrated: false, forecast: forecast({ windSpeed: 30, windDirection: 320 }) }, CONFIG)
    ).toMatch(/^Blown out: .*strong onshore wind\.$/);
    expect(verdict({ stars: 0, swellStars: 0, unrated: false, forecast: forecast({ swellHeight: 0.2, swellPeriod: 4 }) }, CONFIG)).toMatch(
      /^Flat: 0\.2 m wind swell/
    );
  });

  test('missing wind is left out rather than guessed, missing waves say so', () => {
    expect(verdict({ stars: 1, swellStars: 1, unrated: false, forecast: forecast({ windSpeed: null }) }, CONFIG)).toBe(
      'Surfable: 1.3 m swell at 7 s.'
    );
    expect(verdict({ stars: 0, swellStars: 0, unrated: true, forecast: forecast({ swellHeight: null }) }, CONFIG)).toBe(
      'No wave data for this hour.'
    );
  });

  test('period classes', () => {
    expect(periodClass(12)).toBe('groundswell');
    expect(periodClass(8)).toBe('swell');
    expect(periodClass(5)).toBe('wind swell');
    expect(periodClass(null)).toBeNull();
  });

  test('the best window is the first run of the day’s top score', () => {
    const stars = [0, 1, 3, 5, 5, 5, 2, 5];
    const hours: SeriesHour[] = stars.map((s, i) => ({
      stars: s,
      swellStars: s,
      energyKj: 1,
      breakingHeightM: 1,
      unrated: false,
      safety: { isDangerous: false, reason: null },
      forecast: forecast({ timestamp: `2026-09-19T${String(6 + i).padStart(2, '0')}:00` }),
    }));
    expect(bestWindow(hours, '2026-09-19')).toEqual({ from: 3, to: 6, stars: 5, label: '09:00–12:00' });
    expect(bestWindow(hours, '2026-09-20')).toBeNull();

    const flat = hours.map(h => ({ ...h, stars: 0 }));
    expect(bestWindow(flat, '2026-09-19')).toBeNull();
  });
});

test.describe('spec: region-selection / Mejores spots y mejor nota por día', () => {
  const START = Date.parse('2026-09-17T13:00:00Z');
  const H = 3_600_000;
  const spot = (id: string, stars: number[], height = stars.map(() => 15)): SpotHorizon => ({
    id,
    name: id,
    startMs: START,
    stars,
    swellStars: stars,
    height,
    period: stars.map(() => 9),
    danger: [],
  });

  test('ratings are looked up by absolute time, whatever hour the batch started', () => {
    const a = spot('a', [0, 1, 2, 3]);
    expect(ratingAt(a, START + 2 * H)).toMatchObject({ stars: 2, heightM: 1.5, periodS: 9 });
    expect(ratingAt(a, START - H)).toBeNull();
    expect(ratingAt(spot('b', [-1, 2]), START)).toBeNull();
  });

  test('the best spots in view are ranked by score, then swell, then size', () => {
    const spots = [spot('low', [1]), spot('top', [4]), spot('mid-small', [2], [8]), spot('mid-big', [2], [20]), spot('none', [-1])];
    expect(bestAt(spots, START).map(s => s.id)).toEqual(['top', 'mid-big', 'mid-small']);
  });

  test('each day gets its best score across spots and hours', () => {
    const spots = [spot('a', [0, 1, 0, 0]), spot('b', [0, 0, 0, 5])];
    const days = bestByDay(spots, 4, h => START + h * H, h => (h < 2 ? 'thu' : 'fri'));
    expect(days).toEqual({ thu: 1, fri: 5 });
  });
});

test.describe('edge caching', () => {
  test('hour-anchored responses expire at the next whole hour, absolute ones last longer', () => {
    expect(edgeCacheHeaders(undefined, new Date('2026-09-17T10:45:00Z'))['Cache-Control']).toContain('s-maxage=900');
    expect(edgeCacheHeaders(undefined, new Date('2026-09-17T10:59:50Z'))['Cache-Control']).toContain('s-maxage=30');
    expect(edgeCacheHeaders(1800, new Date('2026-09-17T10:59:50Z'))['Cache-Control']).toContain('s-maxage=1800');
  });
});
