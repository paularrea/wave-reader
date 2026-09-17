import { test, expect } from '@playwright/test';
import {
  calculateStarRating,
  energyKj,
  energyScore,
  periodFactor,
  directionFactor,
  windFactor,
  breakingHeightM,
  SpotConfig,
  SkillLevel,
} from '../../src/services/star-engine';
import type { MarineForecast } from '../../src/services/marine-api';

/** A west-facing beach: offshore wind blows from the east (90). */
const SPOT: SpotConfig = {
  swellWindow: { minAngle: 210, maxAngle: 330 },
  offshoreWindAngle: 90,
  windTolerance: 45,
  idealHeight: {
    beginner: { min: 0.4, max: 1.2 },
    intermediate: { min: 1, max: 2.5 },
    expert: { min: 2, max: 5 },
  },
};
const FACING = 270;
const OFFSHORE = 90;

function sea(h: number, t: number, overrides: Partial<MarineForecast> = {}): MarineForecast {
  return {
    timestamp: '2026-09-17T15:00',
    swellHeight: h,
    swellPeriod: t,
    swellDirection: FACING,
    secondarySwellHeight: null,
    secondarySwellPeriod: null,
    secondarySwellDirection: null,
    windWaveHeight: null,
    windWavePeriod: null,
    windWaveDirection: null,
    windSpeed: 5,
    windDirection: OFFSHORE,
    seaLevel: null,
    ...overrides,
  };
}

const rate = (f: MarineForecast, level: SkillLevel = 'intermediate') =>
  calculateStarRating(f, SPOT, level, 'Test Beach');

test.describe('spec: surf-rating / La energía es la base', () => {
  // Published by surf-forecast.com for Zarautz and Barceloneta, 2026-09-17.
  const PUBLISHED: Array<[number, number, number]> = [
    [2.5, 14, 2323],
    [2.1, 13, 1498],
    [1.8, 11, 716],
    [1.4, 11, 457],
    [1.3, 10, 320],
    [0.7, 8, 56],
  ];

  for (const [h, t, kj] of PUBLISHED) {
    test(`${h} m @ ${t} s matches surf-forecast's ${kj} kJ within 10%`, () => {
      expect(Math.abs(energyKj(h, t) - kj) / kj).toBeLessThan(0.1);
    });
  }

  test('more height scores more at the same period', () => {
    expect(rate(sea(2, 12)).stars).toBeGreaterThan(rate(sea(1, 12)).stars);
  });

  test('more period scores more at the same height', () => {
    expect(rate(sea(1.5, 12)).stars).toBeGreaterThan(rate(sea(1.5, 7)).stars);
  });

  test('secondary swell and wind waves add energy', () => {
    const alone = rate(sea(1.2, 11));
    const combined = rate(
      sea(1.2, 11, {
        secondarySwellHeight: 0.8,
        secondarySwellPeriod: 9,
        secondarySwellDirection: FACING,
        windWaveHeight: 0.5,
        windWavePeriod: 5,
        windWaveDirection: FACING,
      })
    );
    expect(combined.energyKj!).toBeGreaterThan(alone.energyKj!);
  });

  test('the energy score climbs with energy and tops out at 10', () => {
    expect(energyScore(100)).toBeLessThan(energyScore(300));
    expect(energyScore(300)).toBeLessThan(energyScore(1000));
    expect(energyScore(1000)).toBeLessThan(energyScore(3000));
    expect(energyScore(5000)).toBe(10);
  });

  test('beyond closeout energy a beach gets worse, not better', () => {
    expect(energyScore(12_000)).toBeLessThan(energyScore(5000));
  });
});

test.describe('spec: surf-rating / El mar plano puntúa cero', () => {
  test('REGRESSION: 0.3 m @ 3 s with light offshore wind scores 0', () => {
    // The report that triggered this change: the old engine gave 8/10.
    for (const level of ['beginner', 'intermediate', 'expert'] as const) {
      expect(rate(sea(0.3, 3, { windSpeed: 12, windDirection: OFFSHORE }), level).stars).toBe(0);
    }
  });

  test('0.2 m @ 4 s in a calm scores 0', () => {
    expect(rate(sea(0.2, 4, { windSpeed: 0 })).stars).toBe(0);
  });

  // Every Barceloneta slot surf-forecast rated 0 on 2026-09-17.
  for (const [h, t] of [[0.4, 4], [0.4, 3], [0.2, 4], [0.2, 5], [0.1, 6], [0.2, 8]]) {
    test(`${h} m @ ${t} s is flat`, () => {
      expect(rate(sea(h, t)).stars).toBe(0);
    });
  }

  test('the potential is 0 as well, so flat is never shown as wind-ruined', () => {
    expect(rate(sea(0.3, 3)).swellStars).toBe(0);
  });
});

test.describe('spec: surf-rating / Independiente del nivel', () => {
  for (const [h, t] of [[0.8, 8], [1.5, 12], [3, 15]]) {
    test(`${h} m @ ${t} s scores the same at every level`, () => {
      const scores = (['beginner', 'intermediate', 'expert'] as const).map(l => rate(sea(h, t), l).stars);
      expect(new Set(scores).size).toBe(1);
    });
  }
});

test.describe('spec: surf-rating / El periodo corto penaliza', () => {
  test('3 m @ 6 s and 1.5 m @ 12 s carry the same energy', () => {
    expect(Math.abs(energyKj(3, 6) - energyKj(1.5, 12)) / energyKj(1.5, 12)).toBeLessThan(0.01);
  });

  test('...but the long period scores more', () => {
    expect(rate(sea(1.5, 12)).stars).toBeGreaterThan(rate(sea(3, 6)).stars);
  });

  test('the period factor is monotonic', () => {
    expect(periodFactor(4)).toBeLessThan(periodFactor(7));
    expect(periodFactor(7)).toBeLessThan(periodFactor(9));
    expect(periodFactor(9)).toBeLessThan(periodFactor(12));
    expect(periodFactor(16)).toBe(1);
  });
});

test.describe('spec: surf-rating / Dirección del swell', () => {
  test('swell inside the window counts in full', () => {
    expect(directionFactor(270, SPOT.swellWindow)).toBe(1);
  });

  test('swell 90 degrees outside the window scores at most a third', () => {
    const headOn = rate(sea(2, 13));
    // 330 is the window edge; 60 is 90 degrees beyond it.
    const outside = rate(sea(2, 13, { swellDirection: 60 }));
    expect(outside.stars).toBeLessThan(headOn.stars);
    expect(outside.stars).toBeLessThanOrEqual(Math.ceil(headOn.stars / 3));
  });

  test('outside the window fades with distance but never reaches zero', () => {
    const near = directionFactor(340, SPOT.swellWindow);
    const far = directionFactor(60, SPOT.swellWindow);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  test('a window that wraps north is handled', () => {
    const wrapping = { minAngle: 300, maxAngle: 40 };
    expect(directionFactor(350, wrapping)).toBe(1);
    expect(directionFactor(10, wrapping)).toBe(1);
    expect(directionFactor(180, wrapping)).toBeLessThan(1);
  });

  test('a full-circle window accepts every direction', () => {
    expect(directionFactor(123, { minAngle: 90, maxAngle: 90 })).toBe(1);
  });
});

test.describe('spec: surf-rating / El viento degrada', () => {
  test('25 km/h onshore at least halves a good score', () => {
    const clean = rate(sea(2, 13, { windSpeed: 5 }));
    const onshore = rate(sea(2, 13, { windSpeed: 25, windDirection: FACING }));
    expect(onshore.stars).toBeLessThanOrEqual(clean.stars / 2);
  });

  test('15 km/h offshore leaves the potential untouched', () => {
    const r = rate(sea(2, 13, { windSpeed: 15, windDirection: OFFSHORE }));
    expect(r.stars).toBe(r.swellStars);
  });

  test('over 75 km/h scores 0 from any direction', () => {
    for (const dir of [OFFSHORE, FACING, 0, 180]) {
      expect(rate(sea(2, 13, { windSpeed: 80, windDirection: dir })).stars).toBe(0);
    }
  });

  test('unknown wind leaves the potential untouched', () => {
    const r = rate(sea(2, 13, { windSpeed: null, windDirection: null }));
    expect(r.stars).toBe(r.swellStars);
  });

  test('onshore hurts more than cross-shore at the same speed', () => {
    expect(windFactor(20, FACING, OFFSHORE)).toBeLessThan(windFactor(20, 0, OFFSHORE));
  });

  test('light wind does nothing whatever its direction', () => {
    expect(windFactor(6, FACING, OFFSHORE)).toBe(1);
  });
});

test.describe('spec: surf-rating / Puntuación potencial', () => {
  test('onshore wind on a good swell leaves potential above the score', () => {
    const r = rate(sea(2, 13, { windSpeed: 25, windDirection: FACING }));
    expect(r.swellStars).toBeGreaterThan(r.stars);
  });

  test('the score never exceeds the potential', () => {
    for (const [h, t] of [[0.5, 5], [1, 9], [2, 12], [3, 16], [5, 18]]) {
      for (const [spd, dir] of [[5, OFFSHORE], [20, FACING], [30, 0], [60, OFFSHORE]]) {
        const r = rate(sea(h, t, { windSpeed: spd, windDirection: dir }));
        expect(r.stars, `${h}m@${t}s ${spd}km/h from ${dir}`).toBeLessThanOrEqual(r.swellStars);
      }
    }
  });

  test('energy is reported in kJ', () => {
    expect(rate(sea(2.5, 14)).energyKj).toBeGreaterThan(2000);
  });
});

test.describe('spec: surf-rating / Sin datos', () => {
  test('no wave height at all is unrated, not flat', () => {
    const r = rate(sea(0, 0, { swellHeight: null, swellPeriod: null }));
    expect(r.unrated).toBe(true);
    expect(r.energyKj).toBeNull();
  });

  test('wind waves alone still get rated', () => {
    const r = rate(
      sea(0, 0, {
        swellHeight: null,
        swellPeriod: null,
        windWaveHeight: 1.5,
        windWavePeriod: 7,
        windWaveDirection: FACING,
      })
    );
    expect(r.unrated).toBe(false);
  });
});

test.describe('spec: condition-rating / Seguridad sobre altura de rompiente', () => {
  test('long period breaks much bigger than the deep-water height', () => {
    expect(breakingHeightM(1.2, 14)).toBeGreaterThan(1.8);
    expect(breakingHeightM(1.2, 14)).toBeGreaterThan(breakingHeightM(1.2, 7));
  });

  test('1.2 m @ 14 s alerts a beginner though 1.2 m is not over the deep-water limit', () => {
    const r = rate(sea(1.2, 14), 'beginner');
    expect(r.safety.isDangerous).toBe(true);
    expect(r.safety.reason).toContain('Test Beach');
    expect(r.safety.reason).toContain('beginners');
  });

  test('1 m @ 8 s does not alert a beginner', () => {
    expect(rate(sea(1, 8), 'beginner').safety.isDangerous).toBe(false);
  });

  test('big surf does not alert an expert', () => {
    expect(rate(sea(3, 14), 'expert').safety.isDangerous).toBe(false);
  });

  test('the alert fires even when the swell misses the window', () => {
    const r = rate(sea(2.5, 14, { swellDirection: 90 }), 'beginner');
    expect(r.safety.isDangerous).toBe(true);
  });
});
