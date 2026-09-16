import { test, expect } from '@playwright/test';
import spots from '../../src/data/spots.json';
import report from '../../src/data/spots.catalog-report.json';

/**
 * Guards the published catalogue. These are the checks the original
 * hand-written catalogue failed: 12 of 61 spots shared coordinates with another
 * spot, every coordinate was rounded to 2 decimals, and several sat in open
 * ocean or inland.
 */

interface Provenance {
  source: string;
  osmType: string;
  osmId: number;
  facingDeg: number;
  exposureDeg: number;
}

interface Spot {
  id: string;
  name: string;
  community: string;
  country: string;
  coordinates: { lat: number; lon: number };
  config: {
    swellWindow: { minAngle: number; maxAngle: number };
    offshoreWindAngle: number;
    windTolerance: number;
    idealHeight: Record<'beginner' | 'intermediate' | 'expert', { min: number; max: number }>;
  };
  provenance: Provenance;
}

const catalogue = spots as unknown as Spot[];

test.describe('spec: spot-catalog / Coordenadas trazables', () => {
  test('every spot records where its coordinate came from', () => {
    for (const spot of catalogue) {
      expect(spot.provenance, `${spot.name} has no provenance`).toBeTruthy();
      expect(spot.provenance.source).toContain('openstreetmap');
      expect(spot.provenance.osmId).toBeTruthy();
      expect(spot.provenance.osmType).toBeTruthy();
    }
  });

  test('unverifiable features were dropped with a recorded reason', () => {
    for (const dropped of report.dropped) {
      expect(dropped.reason, `${dropped.name} dropped without a reason`).toBeTruthy();
    }
  });
});

test.describe('spec: spot-catalog / Exposición al mar abierto', () => {
  test('every spot has a swell window wide enough to break', () => {
    // A cove inside a ría has water in front of it but no swell window; this
    // is what separates it from a surfable beach.
    for (const spot of catalogue) {
      expect(spot.provenance.exposureDeg, `${spot.name} is sheltered`).toBeGreaterThanOrEqual(90);
    }
  });

  test('the offshore wind angle is opposite the way the spot faces', () => {
    for (const spot of catalogue) {
      const expected = (spot.provenance.facingDeg + 180) % 360;
      const diff = Math.abs(spot.config.offshoreWindAngle - expected);
      expect(Math.min(diff, 360 - diff), `${spot.name}`).toBeLessThanOrEqual(1);
    }
  });

  test('every bearing in the config is a valid compass bearing', () => {
    for (const spot of catalogue) {
      for (const bearing of [
        spot.config.offshoreWindAngle,
        spot.config.swellWindow.minAngle,
        spot.config.swellWindow.maxAngle,
        spot.provenance.facingDeg,
      ]) {
        expect(bearing, `${spot.name}`).toBeGreaterThanOrEqual(0);
        expect(bearing, `${spot.name}`).toBeLessThan(360);
      }
    }
  });
});

test.describe('spec: spot-catalog / Sin coordenadas duplicadas', () => {
  test('no two spots share a coordinate', () => {
    const seen = new Map<string, string>();
    for (const spot of catalogue) {
      const key = `${spot.coordinates.lat},${spot.coordinates.lon}`;
      expect(seen.has(key), `${spot.name} duplicates ${seen.get(key)}`).toBe(false);
      seen.set(key, spot.name);
    }
  });

  test('coordinates carry at least 4 decimals of precision', () => {
    for (const spot of catalogue) {
      for (const axis of ['lat', 'lon'] as const) {
        const decimals = String(spot.coordinates[axis]).split('.')[1]?.length ?? 0;
        expect(decimals, `${spot.name} ${axis} is too coarse`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test('ids are unique', () => {
    expect(new Set(catalogue.map(s => s.id)).size).toBe(catalogue.length);
  });
});

test.describe('spec: spot-catalog / Cobertura', () => {
  test('the catalogue is not empty', () => {
    expect(catalogue.length).toBeGreaterThan(0);
  });

  test('every spot declares a country and a region', () => {
    for (const spot of catalogue) {
      expect(spot.country, `${spot.name} has no country`).toBeTruthy();
      expect(spot.community, `${spot.name} has no region`).toBeTruthy();
    }
  });

  test('every spot keeps the config the rating engine needs', () => {
    for (const spot of catalogue) {
      expect(spot.config.swellWindow).toBeTruthy();
      expect(typeof spot.config.offshoreWindAngle).toBe('number');
      for (const level of ['beginner', 'intermediate', 'expert'] as const) {
        const range = spot.config.idealHeight[level];
        expect(range.min, `${spot.name} ${level}`).toBeLessThan(range.max);
      }
    }
  });
});
