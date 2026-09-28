import { create } from 'zustand';

export type SkillLevel = 'beginner' | 'intermediate' | 'expert';

import { DEFAULT_COUNTRY, DEFAULT_REGION } from '@/services/regions';
import type { BestSpot } from '@/services/map-summary';

/**
 * A request to move the camera, made only by the user (a region picked, "my
 * location") or by geolocation on open. A region the map follows as it is
 * panned never moves the camera: the viewport is what chose it.
 */
export type Framing =
  /** The whole region, as picked from the list. */
  | { kind: 'region'; region: string; nonce: number }
  /** Close in on the region: at the surfer's coast when `near` is known, else its busiest stretch. */
  | { kind: 'open'; region: string; near: { lat: number; lon: number } | null; nonce: number };

export interface MapSummary {
  /** Best rated spots in view at the selected hour. */
  best: BestSpot[];
  /** Best score per local day among spots in view; -1 when nothing is rated yet. */
  bestByDay: Record<string, number>;
  /** Spots in view with a rating. */
  rated: number;
}

interface WaveStore {
  selectedSpotId: string | null;
  /** Whole hours after the timeline anchor (next hour on the clock). */
  currentHour: number;
  userSkillLevel: SkillLevel;
  userLocation: { lat: number; lon: number } | null;
  selectedCountry: string;
  selectedRegion: string;
  /**
   * UTC offset of the spot in focus, as resolved by Open-Meteo from its
   * coordinates. Every timeline label is rendered in this offset so a Canary
   * Islands spot never shows peninsular time. Falls back to the browser's own
   * offset until a forecast has been fetched.
   */
  spotUtcOffsetSeconds: number;

  /** Opening resets the hour to today unless `keepHour` (a ranking made for that hour). */
  setSelectedSpot: (id: string | null, options?: { keepHour?: boolean }) => void;
  mapSummary: MapSummary;
  setMapSummary: (summary: MapSummary) => void;
  /** Best score today per region, for regions the map has scored this session. */
  regionBestToday: Record<string, number>;
  setRegionBestToday: (region: string, best: number) => void;
  setCurrentHour: (hour: number) => void;
  setUserSkillLevel: (level: SkillLevel) => void;
  setUserLocation: (lat: number, lon: number) => void;
  setSelectedCountry: (country: string) => void;
  setSelectedRegion: (region: string) => void;
  /** True once geolocation has decided, so it cannot overwrite a manual pick. */
  regionResolved: boolean;
  resolveRegion: (region: string) => void;
  /** Geolocation on open: frames the surfer's coast unless they already chose one. */
  resolveLocation: (country: string, region: string, near?: { lat: number; lon: number } | null) => void;
  /** "Use my location": always frames the surfer's coast. */
  goToLocation: (country: string, region: string, near: { lat: number; lon: number }) => void;
  /** The region the map is mostly showing, set as it is panned. Never moves the camera. */
  followRegion: (country: string, region: string) => void;
  framing: Framing;
  setSpotUtcOffsetSeconds: (seconds: number) => void;
}

/** getTimezoneOffset() is minutes *behind* UTC, so the sign is inverted. */
const browserOffsetSeconds = (): number =>
  typeof window === 'undefined' ? 0 : -new Date().getTimezoneOffset() * 60;

export const useStore = create<WaveStore>(set => ({
  selectedSpotId: null,
  currentHour: 0,
  userSkillLevel: 'intermediate',
  userLocation: null,
  selectedCountry: DEFAULT_COUNTRY,
  selectedRegion: DEFAULT_REGION,
  regionResolved: false,
  framing: { kind: 'open', region: DEFAULT_REGION, near: null, nonce: 0 },
  spotUtcOffsetSeconds: browserOffsetSeconds(),

  // Opening a spot starts from today's first hour, whatever the map was showing:
  // the detail's timeline then shows the rest of the week at a glance.
  setSelectedSpot: (id, options) =>
    set(
      id
        ? options?.keepHour
          ? { selectedSpotId: id }
          : { selectedSpotId: id, currentHour: 0 }
        : { selectedSpotId: null }
    ),
  mapSummary: { best: [], bestByDay: {}, rated: 0 },
  setMapSummary: summary => set({ mapSummary: summary }),
  regionBestToday: {},
  setRegionBestToday: (region, best) =>
    set(state =>
      state.regionBestToday[region] === best
        ? state
        : { regionBestToday: { ...state.regionBestToday, [region]: best } }
    ),
  setCurrentHour: hour => set({ currentHour: hour }),
  setUserSkillLevel: level => set({ userSkillLevel: level }),
  setUserLocation: (lat, lon) => set({ userLocation: { lat, lon } }),
  // A manual choice also counts as resolved: a late geolocation callback must
  // not yank the user back to their own coast.
  setSelectedCountry: country => set({ selectedCountry: country, regionResolved: true }),
  setSelectedRegion: region =>
    set(state => ({
      selectedRegion: region,
      regionResolved: true,
      framing: { kind: 'region', region, nonce: state.framing.nonce + 1 },
    })),
  resolveRegion: region =>
    set(state => (state.regionResolved ? state : { selectedRegion: region, regionResolved: true })),
  resolveLocation: (country, region, near = null) =>
    set(state =>
      state.regionResolved
        ? state
        : {
            selectedCountry: country,
            selectedRegion: region,
            regionResolved: true,
            framing: { kind: 'open', region, near, nonce: state.framing.nonce + 1 },
          }
    ),
  goToLocation: (country, region, near) =>
    set(state => ({
      selectedCountry: country,
      selectedRegion: region,
      regionResolved: true,
      framing: { kind: 'open', region, near, nonce: state.framing.nonce + 1 },
    })),
  // Panning counts as a choice too: a geolocation answer arriving after the
  // surfer has moved the map must not drag it back.
  followRegion: (country, region) =>
    set(state =>
      state.selectedCountry === country && state.selectedRegion === region
        ? state
        : { selectedCountry: country, selectedRegion: region, regionResolved: true }
    ),
  setSpotUtcOffsetSeconds: seconds => set({ spotUtcOffsetSeconds: seconds }),
}));
