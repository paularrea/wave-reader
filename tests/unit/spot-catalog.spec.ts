import { test, expect } from '@playwright/test';
import spots from '../../src/data/spots.json';
import report from '../../src/data/spots.catalog-report.json';

/**
 * Guards the published catalogue. These are the checks the previous hand-written
 * catalogue failed: 12 of 61 spots shared coordinates with another spot, every
 * coordinate was rounded to 2 decimals, and several sat in open water.
 */

test.describe('spec: spot-catalog / Coordenadas trazables', () => {
  test('every spot records where its coordinate came from', () => {
    for (const spot of spots) {
      expect(spot.provenance, `${spot.name} has no provenance`).toBeTruthy();
      expect(spot.provenance.source).toBe('openstreetmap-nominatim');
      expect(spot.provenance.osmId).toBeTruthy();
      expect(spot.provenance.displayName).toBeTruthy();
    }
  });

  test('unverifiable spots were dropped with a recorded reason', () => {
    for (const dropped of report.dropped) {
      expect(dropped.reason, `${dropped.name} dropped without a reason`).toBeTruthy();
    }
  });

  test('nothing in the catalogue was also dropped', () => {
    const keptIds = new Set(spots.map(s => s.id));
    for (const dropped of report.dropped) {
      expect(keptIds.has(dropped.id), `${dropped.name} is both kept and dropped`).toBe(false);
    }
  });
});

test.describe('spec: spot-catalog / Cada spot cae en la costa', () => {
  test('every spot has land nearby and is not inland', () => {
    // A beach node often sits exactly on the waterline and reads 0 m, which is
    // indistinguishable from open ocean by its own elevation. The neighbouring
    // samples are what separate a shoreline from the middle of the sea.
    for (const spot of spots) {
      expect(
        spot.provenance.nearbyLandElevationM,
        `${spot.name} has no land within 300 m (open water)`
      ).toBeGreaterThan(0);
      expect(spot.provenance.elevationM, `${spot.name} is inland`).toBeLessThan(100);
    }
  });

  test('every spot resolved to a surfable coastal feature', () => {
    const allowed = ['natural/beach', 'natural/bay', 'natural/reef'];
    for (const spot of spots) {
      expect(allowed, `${spot.name} is a ${spot.provenance.featureType}`).toContain(
        spot.provenance.featureType
      );
    }
  });
});

test.describe('spec: spot-catalog / Sin coordenadas duplicadas', () => {
  test('no two spots share a coordinate', () => {
    const seen = new Map<string, string>();
    for (const spot of spots) {
      const key = `${spot.coordinates.lat},${spot.coordinates.lon}`;
      expect(seen.has(key), `${spot.name} duplicates ${seen.get(key)}`).toBe(false);
      seen.set(key, spot.name);
    }
    expect(seen.size).toBe(spots.length);
  });

  test('coordinates carry at least 4 decimals of precision', () => {
    for (const spot of spots) {
      for (const axis of ['lat', 'lon'] as const) {
        const decimals = String(spot.coordinates[axis]).split('.')[1]?.length ?? 0;
        expect(decimals, `${spot.name} ${axis} is too coarse`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test('ids are unique', () => {
    expect(new Set(spots.map(s => s.id)).size).toBe(spots.length);
  });
});

test.describe('spec: spot-catalog / El match corresponde al spot pedido', () => {
  const normalize = (v: string) =>
    v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const baseName = (name: string) =>
    normalize(name)
      .replace(/\s*\(.*\)\s*/, '')
      .replace(/^(playa de|playa|praia de|praia|platja de)\s+/, '')
      .trim();

  test('every spot name appears in the place OSM matched', () => {
    // Guards against a neighbouring beach winning the match: type, community
    // and elevation all pass for the wrong beach a few kilometres away.
    for (const spot of spots) {
      expect(
        normalize(spot.provenance.displayName),
        `${spot.name} resolved to "${spot.provenance.displayName}"`
      ).toContain(baseName(spot.name));
    }
  });
});

test.describe('catalogue is usable', () => {
  test('at least one spot survived verification', () => {
    expect(spots.length).toBeGreaterThan(0);
  });

  test('every spot keeps the config the rating engine needs', () => {
    for (const spot of spots) {
      expect(spot.config.swellWindow).toBeTruthy();
      expect(typeof spot.config.offshoreWindAngle).toBe('number');
      for (const level of ['beginner', 'intermediate', 'expert'] as const) {
        const range = spot.config.idealHeight[level];
        expect(range.min, `${spot.name} ${level}`).toBeLessThan(range.max);
      }
    }
  });
});

