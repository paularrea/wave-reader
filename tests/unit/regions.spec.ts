import { test, expect } from '@playwright/test';
import {
  DEFAULT_COUNTRY,
  DEFAULT_REGION,
  allCountries,
  allRegions,
  regionsForCountry,
  countryOfRegion,
  locationDefaults,
  regionForLocation,
  regionBounds,
  regionsInBounds,
  openingBounds,
  widen,
  AUTO_REGION_ZOOM,
  CLOSE_ZOOM,
} from '../../src/services/regions';

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

test.describe('spec: region-selection / País y región', () => {
  test('every country has at least one region', () => {
    for (const country of allCountries()) {
      expect(regionsForCountry(country).length, `${country} has no regions`).toBeGreaterThan(0);
    }
  });

  test('regions belong to exactly one country', () => {
    for (const country of allCountries()) {
      for (const region of regionsForCountry(country)) {
        expect(countryOfRegion(region)).toBe(country);
      }
    }
  });

  test('the defaults exist in the catalogue', () => {
    // A default pointing at something absent leaves the selector on a value
    // with no option and the map empty.
    expect(allCountries()).toContain(DEFAULT_COUNTRY);
    expect(regionsForCountry(DEFAULT_COUNTRY)).toContain(DEFAULT_REGION);
  });
});

test.describe('spec: region-selection / Desde la geolocalización', () => {
  test('a location far from any coast falls back to the defaults', () => {
    // Madrid is ~300 km from the nearest sea.
    const { country, region } = locationDefaults(40.4168, -3.7038);
    expect(country).toBe(DEFAULT_COUNTRY);
    expect(region).toBe(DEFAULT_REGION);
  });

  test('a coastal location resolves to a catalogued region', () => {
    expect(allRegions()).toContain(regionForLocation(43.29, -2.15)); // Basque coast
  });

  test('locations on different coasts resolve differently', () => {
    expect(regionForLocation(43.29, -2.15)).not.toBe(regionForLocation(36.5, -6.2));
  });
});

test.describe('spec: region-selection / Encuadre del mapa', () => {
  test('every region has bounds the map can fly to', () => {
    for (const region of allRegions()) {
      const bounds = regionBounds(region);
      expect(bounds, `${region} has no bounds`).not.toBeNull();
      expect(bounds!.west).toBeLessThanOrEqual(bounds!.east);
      expect(bounds!.south).toBeLessThanOrEqual(bounds!.north);
    }
  });

  test('an unknown region has no bounds rather than throwing', () => {
    expect(regionBounds('Atlantis')).toBeNull();
  });
});

test.describe('spec: region-selection / Las regiones siguen al mapa', () => {
  // Donostia to Biarritz, across the Bidasoa: Basque coast one side, Nouvelle-Aquitaine the other.
  const border = { west: -2.05, south: 43.3, east: -1.45, north: 43.55 };

  test('a view across a border lists both regions, most spots first', () => {
    const regions = regionsInBounds(border);
    const names = regions.map(r => r.region);
    expect(names).toContain('País Vasco');
    expect(names).toContain('Nouvelle-Aquitaine');
    expect(regions.find(r => r.region === 'Nouvelle-Aquitaine')!.country).toBe('France');
    for (let i = 1; i < regions.length; i++) expect(regions[i - 1].spots).toBeGreaterThanOrEqual(regions[i].spots);
  });

  test('open sea has no regions, and widening a view never loses one', () => {
    expect(regionsInBounds({ west: -20, south: 45, east: -19, north: 46 })).toEqual([]);
    const narrow = regionsInBounds(border).map(r => r.region);
    const wide = regionsInBounds(widen(border, 0.35)).map(r => r.region);
    for (const region of narrow) expect(wide).toContain(region);
  });

  test('the app opens on a stretch of coast, not on a whole region', () => {
    for (const region of ['Cataluña', 'País Vasco', 'Canarias']) {
      const open = openingBounds(region)!;
      const whole = regionBounds(region)!;
      expect(open.east - open.west).toBeLessThanOrEqual(whole.east - whole.west + 1e-9);
      expect(open.north - open.south).toBeLessThanOrEqual(whole.north - whole.south + 1e-9);
    }
    // Near the surfer when their position is known.
    const near = openingBounds('País Vasco', { lat: 43.32, lon: -1.98 })!;
    expect(near.west).toBeLessThanOrEqual(-1.98 + 0.3);
    expect(near.east).toBeGreaterThanOrEqual(-1.98 - 0.3);
  });

  test('opening close in still follows the map', () => {
    expect(CLOSE_ZOOM).toBeGreaterThan(AUTO_REGION_ZOOM);
  });
});
