import { test, expect } from '@playwright/test';
import { DEFAULT_REGION, allRegions, regionForLocation } from '../../src/services/regions';

test.describe('spec: region-selection / No hay opción "todas"', () => {
  test('the region list contains only real regions', () => {
    const regions = allRegions();
    expect(regions.length).toBeGreaterThan(0);
    expect(regions).not.toContain('all');
    for (const region of regions) {
      expect(region.toLowerCase()).not.toContain('all regions');
    }
  });

  test('regions are unique and alphabetical', () => {
    const regions = allRegions();
    expect(new Set(regions).size).toBe(regions.length);
    expect([...regions].sort((a, b) => a.localeCompare(b, 'es'))).toEqual(regions);
  });
});

test.describe('spec: region-selection / Región por defecto', () => {
  test('the default region exists in the catalogue', () => {
    // Pointing the default at a missing region leaves the selector on a value
    // with no option and the map empty.
    expect(allRegions()).toContain(DEFAULT_REGION);
  });

  test('a location far from any coast falls back to the default', () => {
    // Madrid is ~300 km from the nearest sea.
    expect(regionForLocation(40.4168, -3.7038)).toBe(DEFAULT_REGION);
  });
});

test.describe('spec: region-selection / Región desde la geolocalización', () => {
  test('a coastal location resolves to a region in the catalogue', () => {
    expect(allRegions()).toContain(regionForLocation(43.29, -2.15)); // Zarautz
  });

  test('locations on different coasts resolve differently', () => {
    const basque = regionForLocation(43.29, -2.15);
    const galician = regionForLocation(43.29, -8.68); // Razo
    expect(basque).not.toBe(galician);
  });
});
