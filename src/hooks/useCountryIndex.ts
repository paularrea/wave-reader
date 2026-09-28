'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
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
 * The light spot index of each country, fetched on demand.
 *
 * The whole catalogue is 2,000 spots across five countries and will keep
 * growing; a surfer in Catalunya has no use for the Scottish ones. Each
 * country's index is a separate chunk, loaded the first time the map needs it
 * -- the country picked, or one the viewport has reached -- and kept for the
 * session.
 */
const LOADERS: Record<string, () => Promise<{ default: IndexSpot[] }>> = {
  es: () => import('@/data/spots/es.index.json'),
  fr: () => import('@/data/spots/fr.index.json'),
  gb: () => import('@/data/spots/gb.index.json'),
  ie: () => import('@/data/spots/ie.index.json'),
  pt: () => import('@/data/spots/pt.index.json'),
};

const cache = new Map<string, IndexSpot[]>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
/** Bumped whenever a country arrives, so subscribers re-read the cache. */
let version = 0;

function load(iso2: string) {
  if (cache.has(iso2) || loading.has(iso2) || !LOADERS[iso2]) return;
  loading.add(iso2);
  LOADERS[iso2]()
    .then(module => {
      cache.set(iso2, module.default);
      version += 1;
      listeners.forEach(listener => listener());
    })
    .catch(error => console.warn(`Could not load the spot index for ${iso2}:`, error))
    .finally(() => loading.delete(iso2));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getVersion = () => version;
const getServerVersion = () => 0;

/** Spots of every country listed, loading the ones not fetched yet. */
export function useCountryIndexes(countries: string[]): IndexSpot[] {
  const key = [...new Set(countries.map(countryIso2).filter((iso): iso is string => !!iso))].sort().join(',');
  useEffect(() => {
    if (key) key.split(',').forEach(load);
  }, [key]);
  const current = useSyncExternalStore(subscribe, getVersion, getServerVersion);
  return useMemo(
    () => (key ? key.split(',').flatMap(iso => cache.get(iso) ?? []) : []),
    // `current` is what changes when a country arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, current]
  );
}

export function useCountryIndex(country: string): IndexSpot[] {
  return useCountryIndexes([country]);
}

/**
 * A spot from any country loaded so far. The map can show two countries at
 * once, so the spot a marker opens is not always in the picked one.
 */
export function useLoadedSpot(id: string | null): IndexSpot | undefined {
  const current = useSyncExternalStore(subscribe, getVersion, getServerVersion);
  return useMemo(() => {
    if (!id) return undefined;
    for (const spots of cache.values()) {
      const spot = spots.find(s => s.id === id);
      if (spot) return spot;
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, current]);
}
