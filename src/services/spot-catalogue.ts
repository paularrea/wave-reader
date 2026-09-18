import es from '../data/spots/es.json';
import fr from '../data/spots/fr.json';
import gb from '../data/spots/gb.json';
import ie from '../data/spots/ie.json';
import type { SpotConfig } from './star-engine';

/**
 * The full catalogue, one file per country.
 *
 * **Server side only.** These files carry every spot's swell window, offshore
 * angle and provenance, which only the forecast routes need; importing this
 * module from a client component would ship all of it to the browser. The
 * browser gets `spot-index.ts` instead, which loads the light index of the one
 * country in focus.
 *
 * A country is the unit of growth: adding Portugal adds a file and a line here,
 * and changes nothing a surfer in Catalunya downloads.
 */

export interface CatalogueSpot {
  id: string;
  name: string;
  community: string;
  country: string;
  type: string;
  coordinates: { lat: number; lon: number };
  config: SpotConfig;
  provenance?: Record<string, unknown>;
}

const BY_COUNTRY: Record<string, CatalogueSpot[]> = {
  Spain: es as CatalogueSpot[],
  France: fr as CatalogueSpot[],
  'United Kingdom': gb as CatalogueSpot[],
  Ireland: ie as CatalogueSpot[],
};

export function allSpots(): CatalogueSpot[] {
  return Object.values(BY_COUNTRY).flat();
}

export function spotsOfCountry(country: string): CatalogueSpot[] {
  return BY_COUNTRY[country] ?? [];
}

/**
 * Spots of a region, ordered by id so the batch chunks are stable: the client
 * asks for "chunk 3 of Galicia" and must get the same 50 spots every time.
 */
export function spotsOfRegion(region: string): CatalogueSpot[] {
  return allSpots()
    .filter(spot => spot.community === region)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function spotById(id: string): CatalogueSpot | undefined {
  return allSpots().find(spot => spot.id === id);
}
