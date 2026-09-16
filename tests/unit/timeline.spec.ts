import { test, expect } from '@playwright/test';
import { anchorInstant, instantAt, dayLabel, formatInstant } from '../../src/services/timeline';

const MADRID_SUMMER = 2 * 3600; // UTC+2
const CANARY_SUMMER = 1 * 3600; // UTC+1

test.describe('spec: forecast-timeline / Anclaje a la hora en curso', () => {
  test('14:20 local rounds up to 15:00', () => {
    // 12:20 UTC is 14:20 in UTC+2.
    const now = new Date('2026-09-16T12:20:00Z');
    expect(anchorInstant(MADRID_SUMMER, now).key).toBe('2026-09-16T15:00');
  });

  test('17:00 sharp stays at 17:00', () => {
    const now = new Date('2026-09-16T15:00:00.000Z');
    expect(anchorInstant(MADRID_SUMMER, now).key).toBe('2026-09-16T17:00');
  });

  test('17:50 local rounds up to 18:00', () => {
    const now = new Date('2026-09-16T15:50:00Z');
    expect(anchorInstant(MADRID_SUMMER, now).key).toBe('2026-09-16T18:00');
  });
});

test.describe('spec: forecast-timeline / Granularidad horaria', () => {
  test('one step advances exactly 60 minutes and lands on the hour', () => {
    const now = new Date('2026-09-16T12:20:00Z');
    const first = instantAt(MADRID_SUMMER, 0, now);
    const second = instantAt(MADRID_SUMMER, 1, now);

    expect(first.key).toBe('2026-09-16T15:00');
    expect(second.key).toBe('2026-09-16T16:00');
    expect(Date.parse(`${second.key}:00Z`) - Date.parse(`${first.key}:00Z`)).toBe(3_600_000);
  });

  test('every offset across a week lands on a whole hour', () => {
    const now = new Date('2026-09-16T12:20:00Z');
    for (let hour = 0; hour <= 168; hour++) {
      expect(instantAt(MADRID_SUMMER, hour, now).key).toMatch(/T\d{2}:00$/);
    }
  });
});

test.describe('spec: forecast-timeline / Zona horaria del spot', () => {
  test('a Canary spot reads one hour behind a peninsular one', () => {
    const now = new Date('2026-09-16T12:20:00Z');
    // 12:20 UTC -> 14:20 peninsular (rounds to 15:00), 13:20 Canary (rounds to 14:00).
    expect(instantAt(MADRID_SUMMER, 0, now).hour).toBe(15);
    expect(instantAt(CANARY_SUMMER, 0, now).hour).toBe(14);
  });
});

test.describe('spec: forecast-timeline / Agrupación por días', () => {
  test('the current day is labelled Today', () => {
    const now = new Date('2026-09-16T12:20:00Z');
    const instant = instantAt(MADRID_SUMMER, 0, now);
    expect(dayLabel(instant, MADRID_SUMMER, now).label).toBe('Today');
  });

  test('advancing from 23:00 rolls to 00:00 and flips the day label', () => {
    const now = new Date('2026-09-16T20:20:00Z'); // 22:20 local -> anchor 23:00
    const atAnchor = instantAt(MADRID_SUMMER, 0, now);
    const nextHour = instantAt(MADRID_SUMMER, 1, now);

    expect(atAnchor.hour).toBe(23);
    expect(dayLabel(atAnchor, MADRID_SUMMER, now).label).toBe('Today');

    expect(nextHour.hour).toBe(0);
    expect(nextHour.day).toBe('2026-09-17');
    expect(dayLabel(nextHour, MADRID_SUMMER, now).label).toBe('Tomorrow');
    expect(dayLabel(nextHour, MADRID_SUMMER, now).isDayBoundary).toBe(true);
  });

  test('days beyond tomorrow carry weekday and date', () => {
    const now = new Date('2026-09-16T12:20:00Z');
    const threeDaysOut = instantAt(MADRID_SUMMER, 72, now);
    const label = dayLabel(threeDaysOut, MADRID_SUMMER, now).label;

    expect(label).not.toBe('Today');
    expect(label).not.toBe('Tomorrow');
    expect(label).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2,4}$/); // e.g. "Sat 19 Sept"
  });

  test('the full label pairs day and hour', () => {
    const now = new Date('2026-09-16T12:20:00Z');
    const instant = instantAt(MADRID_SUMMER, 0, now);
    expect(formatInstant(instant, MADRID_SUMMER, now)).toBe('Today, 15:00');
  });
});
