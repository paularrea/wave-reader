'use client';

import { useEffect, useState } from 'react';
import { countryIso2 } from '@/services/regions';

export interface IndexSpot {
  id: string;
  name: string;
  community: string;
  country: string;
  type: string;
  coordinates: { lat: number; lon: number };
}

/**
 * The light spot index of one country, fetched on demand.
 *
 * The whole catalogue is 1,400 spots across four countries and will keep
 * growing; a surfer in Catalunya has no use for the Scottish ones. Each
 * country's index is a separate chunk, loaded the first time that country is
 * selected and kept for the session.
 */
const LOADERS: Record<string, () => Promise<{ default: IndexSpot[] }>> = {
  es: () => import('@/data/spots/es.index.json'),
  fr: () => import('@/data/spots/fr.index.json'),
  gb: () => import('@/data/spots/gb.index.json'),
  ie: () => import('@/data/spots/ie.index.json'),
};

const cache = new Map<string, IndexSpot[]>();

const EMPTY: IndexSpot[] = [];

export function useCountryIndex(country: string): IndexSpot[] {
  const iso2 = countryIso2(country);
  /**
   * What the last completed load produced, labelled with the country it was
   * for. The value is *derived* from it rather than copied into state by the
   * effect: setting state synchronously inside an effect makes React render
   * twice for every country change.
   */
  const [loaded, setLoaded] = useState<{ iso2: string; spots: IndexSpot[] } | null>(null);

  useEffect(() => {
    if (!iso2 || cache.has(iso2)) return;

    let live = true;
    LOADERS[iso2]?.()
      .then(module => {
        cache.set(iso2, module.default);
        if (live) setLoaded({ iso2, spots: module.default });
      })
      .catch(error => console.warn(`Could not load the spot index for ${country}:`, error));

    return () => {
      live = false;
    };
  }, [iso2, country]);

  if (!iso2) return EMPTY;
  return cache.get(iso2) ?? (loaded?.iso2 === iso2 ? loaded.spots : EMPTY);
}
