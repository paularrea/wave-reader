import { test, expect } from '@playwright/test';
import {
  MODELS,
  toModelStatus,
  describeNextUpdate,
  describeAgo,
  describeInterval,
} from '../../src/services/data-status';

const WAM = MODELS.find(m => m.id === 'ecmwf_wam')!;

test.describe('spec: data-transparency / Fuentes de datos y modelos', () => {
  test('wave and wind models are both listed with resolution', () => {
    expect(MODELS.some(m => m.role === 'waves')).toBe(true);
    expect(MODELS.some(m => m.role === 'wind')).toBe(true);
    for (const m of MODELS) expect(m.resolution).toMatch(/km/);
  });
});

test.describe('spec: data-transparency / Estado de actualización real', () => {
  test('next update is one interval after the last run became available', () => {
    const s = toModelStatus(WAM, {
      last_run_initialisation_time: 1_000_000,
      last_run_availability_time: 1_020_000,
      update_interval_seconds: 21_600,
    });
    expect(s.status).toBe('ok');
    expect(s.lastRunAvailableAt).toBe(1_020_000_000);
    expect(s.nextExpectedAt).toBe((1_020_000 + 21_600) * 1000);
  });

  test('2h 5m remaining reads as a countdown', () => {
    const now = 1_000_000_000;
    expect(describeNextUpdate(now + (2 * 60 + 5) * 60_000, now)).toBe('in 2h 5m');
  });

  test('a past expected time says the update is due, never a negative time', () => {
    const now = 1_000_000_000;
    expect(describeNextUpdate(now - 45 * 60_000, now)).toBe('Due now');
  });

  test('missing metadata is reported as unavailable, with no invented times', () => {
    const s = toModelStatus(WAM, null);
    expect(s.status).toBe('unavailable');
    expect(s.nextExpectedAt).toBeNull();
    expect(describeNextUpdate(s.nextExpectedAt, Date.now())).toBe('Unavailable');
  });

  test('partial metadata is treated as unavailable', () => {
    expect(toModelStatus(WAM, { last_run_availability_time: 1 }).status).toBe('unavailable');
  });

  test('last run and interval read naturally', () => {
    const now = 10_000_000;
    expect(describeAgo(now - 3 * 3_600_000 - 12 * 60_000, now)).toBe('3h 12m ago');
    expect(describeInterval(21_600)).toBe('Every 6h');
    expect(describeInterval(43_200)).toBe('Every 12h');
  });
});
