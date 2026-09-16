import { test, expect } from '@playwright/test';
import {
  qualityColor,
  qualityOpacity,
  windBadge,
  swellColor,
  formatWind,
  compassPoint,
} from '../../src/services/conditions';
import { calculateStarRating } from '../../src/services/star-engine';
import type { MarineForecast } from '../../src/services/marine-api';

const SPOT = { offshoreWindAngle: 140, windTolerance: 30 };

function forecast(overrides: Partial<MarineForecast> = {}): MarineForecast {
  return {
    timestamp: '2026-09-16T15:00',
    swellHeight: 1.5,
    swellPeriod: 12,
    swellDirection: 300,
    secondarySwellHeight: null,
    secondarySwellPeriod: null,
    secondarySwellDirection: null,
    windWaveHeight: null,
    windWavePeriod: null,
    windWaveDirection: null,
    windSpeed: 15,
    windDirection: 140,
    seaLevel: 0.4,
    ...overrides,
  };
}

test.describe('spec: condition-rating / Escala de calidad monocroma amarilla', () => {
  test('a higher score renders more opaque in the same hue', () => {
    expect(qualityOpacity(9)).toBeGreaterThan(qualityOpacity(3));
    expect(qualityColor(9)).toContain('250, 204, 21');
    expect(qualityColor(3)).toContain('250, 204, 21');
  });

  test('no score anywhere on the scale produces a green', () => {
    // Greens have a dominant green channel; the yellow ramp has R ~= G.
    for (let stars = 0; stars <= 10; stars++) {
      const color = qualityColor(stars);
      const [r, g] = color.match(/\d+/g)!.slice(0, 2).map(Number);
      expect(g).toBeLessThanOrEqual(r);
    }
  });

  test('a dangerous spot overrides the ramp with red', () => {
    expect(qualityColor(8, { isDangerous: true })).toBe('#EF4444');
  });

  test('an unrated spot is grey, not a zero-star yellow', () => {
    expect(qualityColor(0, { unrated: true })).toBe('#52525B');
  });
});

test.describe('spec: condition-rating / Badge de condición de viento', () => {
  test('wind aligned with the offshore angle is Off-shore green', () => {
    const badge = windBadge(forecast({ windDirection: 140, windSpeed: 15 }), SPOT)!;
    expect(badge.label).toBe('Off-shore');
    expect(badge.background).toBe('#22C55E');
  });

  test('wind opposite the offshore angle is On-shore grey', () => {
    const badge = windBadge(forecast({ windDirection: 320, windSpeed: 15 }), SPOT)!;
    expect(badge.label).toBe('On-shore');
    expect(badge.background).toBe('#71717A');
  });

  test('sideshore wind is Cross-shore light green', () => {
    const badge = windBadge(forecast({ windDirection: 230, windSpeed: 15 }), SPOT)!;
    expect(badge.label).toBe('Cross-shore');
    expect(badge.background).toBe('#86EFAC');
  });

  test('wind under 5 km/h is Glass regardless of direction', () => {
    const badge = windBadge(forecast({ windSpeed: 3, windDirection: 320 }), SPOT)!;
    expect(badge.label).toBe('Glass');
  });

  test('REGRESSION: missing wind yields no badge, never Glass', () => {
    // The original bug: the marine endpoint returns null wind, `null * 1.852`
    // evaluated to 0, and every spot on the map reported a flat calm.
    expect(windBadge(forecast({ windSpeed: null, windDirection: null }), SPOT)).toBeNull();
  });

  test('missing wind renders as "No data", not "0 km/h"', () => {
    expect(formatWind(null, null)).toBe('No data');
    expect(formatWind(null, null)).not.toContain('0');
  });

  test('wind is reported with speed and compass direction', () => {
    expect(formatWind(18, 315)).toBe('18 km/h NW');
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(180)).toBe('S');
  });
});

test.describe('spec: condition-rating / Gradiente de altura de ola', () => {
  test('small surf is a lighter blue than big surf', () => {
    const luminance = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

    expect(luminance(swellColor(0.4))).toBeGreaterThan(luminance(swellColor(2.0)));
    expect(luminance(swellColor(2.0))).toBeGreaterThan(luminance(swellColor(4.5)));
  });
});

test.describe('spec: condition-rating / Alerta de seguridad', () => {
  const config = {
    swellWindow: { minAngle: 280, maxAngle: 340 },
    offshoreWindAngle: 140,
    windTolerance: 30,
    idealHeight: {
      beginner: { min: 0.5, max: 1.0 },
      intermediate: { min: 1.0, max: 2.0 },
      expert: { min: 2.0, max: 4.0 },
    },
  };

  test('a beginner above the ceiling gets a reason naming size, limit and spot', () => {
    const result = calculateStarRating(forecast({ swellHeight: 2.4 }), config, 'beginner', 'Playa de Razo');

    expect(result.safety.isDangerous).toBe(true);
    expect(result.safety.reason).toContain('Playa de Razo');
    expect(result.safety.reason).toContain('2.4m');
    expect(result.safety.reason).toContain('1m');
  });

  test('an expert within range gets no alert', () => {
    const result = calculateStarRating(forecast({ swellHeight: 2.5 }), config, 'expert', 'Playa de Razo');
    expect(result.safety.isDangerous).toBe(false);
    expect(result.safety.reason).toBeNull();
  });

  test('the alert fires even when the swell misses the window', () => {
    // A closed-out spot is still dangerous to paddle out at.
    const offWindow = forecast({ swellHeight: 3.0, swellDirection: 90 });
    const result = calculateStarRating(offWindow, config, 'beginner', 'Playa de Razo');

    expect(result.stars).toBe(0);
    expect(result.safety.isDangerous).toBe(true);
  });

  test('missing swell data is unrated, not zero stars', () => {
    const result = calculateStarRating(forecast({ swellHeight: null }), config, 'intermediate');
    expect(result.unrated).toBe(true);
  });
});
