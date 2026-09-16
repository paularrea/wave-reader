import { test, expect } from '@playwright/test';
import { compassPoint } from '../../src/services/conditions';

test.describe('spec: condition-rating / Dirección legible', () => {
  test('bearings map to the right compass point', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(45)).toBe('NE');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(315)).toBe('NW');
  });

  test('bearings wrap around north', () => {
    expect(compassPoint(360)).toBe('N');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(-45)).toBe('NW');
  });

  test('a missing bearing has no compass point', () => {
    expect(compassPoint(null)).toBeNull();
  });
});
