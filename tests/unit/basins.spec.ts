import { test, expect } from '@playwright/test';
import { basinOf } from '../../src/services/basins';
import { calculateStarRating, SpotConfig } from '../../src/services/star-engine';
import type { MarineForecast } from '../../src/services/marine-api';

const SPOT: SpotConfig = {
  swellWindow: { minAngle: 0, maxAngle: 0 },
  offshoreWindAngle: 0, // faces 180
  windTolerance: 45,
  idealHeight: { beginner: { min: 0.4, max: 1.2 }, intermediate: { min: 1, max: 2.5 }, expert: { min: 2, max: 5 } },
};

function sea(h: number, t: number, windKmh = 0, windFrom = 0): MarineForecast {
  return {
    timestamp: 'x', swellHeight: h, swellPeriod: t, swellDirection: 180,
    secondarySwellHeight: null, secondarySwellPeriod: null, secondarySwellDirection: null,
    windWaveHeight: null, windWavePeriod: null, windWaveDirection: null,
    windSpeed: windKmh, windDirection: windFrom, seaLevel: null,
  };
}
const med = (f: MarineForecast) => calculateStarRating(f, SPOT, 'intermediate', 'x', 'mediterranean').stars;
const atl = (f: MarineForecast) => calculateStarRating(f, SPOT, 'intermediate', 'x', 'atlantic').stars;

test.describe('spec: surf-rating / Clasificación por coordenadas', () => {
  const MED: Array<[string, number, number]> = [
    ['Barcelona', 41.38, 2.19], ['Málaga', 36.72, -4.42], ['Mallorca', 39.75, 3.43], ['Marseille', 43.3, 5.37],
    ['Valencia', 39.47, -0.33], ['Corse', 41.92, 8.74], ['Ceuta', 35.89, -5.3], ['Tarragona', 41.11, 1.25],
  ];
  const ATL: Array<[string, number, number]> = [
    ['Zarautz', 43.29, -2.17], ['Cádiz', 36.52, -6.29], ['Biarritz', 43.48, -1.56], ['Newquay', 50.42, -5.1],
    ['Famara', 29.12, -13.56], ['Razo', 43.29, -8.7], ['Tarifa Los Lances', 36.03, -5.63], ['Hossegor', 43.66, -1.44],
  ];
  for (const [name, lat, lon] of MED) test(`${name} is Mediterranean`, () => expect(basinOf(lat, lon)).toBe('mediterranean'));
  for (const [name, lat, lon] of ATL) test(`${name} is not Mediterranean`, () => expect(basinOf(lat, lon)).toBe('atlantic'));
});

test.describe('spec: surf-rating / Escala propia del Mediterráneo', () => {
  test('1 m @ 7 s glassy scores 2 to 3', () => {
    const s = med(sea(1, 7));
    expect(s).toBeGreaterThanOrEqual(2);
    expect(s).toBeLessThanOrEqual(3);
  });

  test('1 m @ 7 s with 15 km/h cross-offshore scores 2 to 3', () => {
    // Facing 180; wind from 45 degrees off the offshore bearing (0).
    const s = med(sea(1, 7, 15, 45));
    expect(s).toBeGreaterThanOrEqual(2);
    expect(s).toBeLessThanOrEqual(3);
  });

  test('1.5 m @ 8 s glassy scores 5 to 6', () => {
    const s = med(sea(1.5, 8));
    expect(s).toBeGreaterThanOrEqual(5);
    expect(s).toBeLessThanOrEqual(6);
  });

  test('0.3 m @ 4 s is flat', () => {
    expect(med(sea(0.3, 4))).toBe(0);
  });

  test('the same sea scores higher in the Mediterranean than in the Atlantic', () => {
    expect(med(sea(1.5, 8))).toBeGreaterThan(atl(sea(1.5, 8)));
  });

  test('the Mediterranean scale is monotonic in size', () => {
    let prev = -1;
    for (const [h, t] of [[0.5, 5], [1, 7], [1.5, 8], [2, 9], [2.5, 10], [3.5, 11]]) {
      const s = med(sea(h, t));
      expect(s, `${h}m @ ${t}s`).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  test('onshore wind still spoils a Mediterranean day', () => {
    expect(med(sea(1.5, 8, 25, 180))).toBeLessThan(med(sea(1.5, 8)));
  });
});
