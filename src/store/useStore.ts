import { create } from 'zustand';

export type SkillLevel = 'beginner' | 'intermediate' | 'expert';

import { DEFAULT_COUNTRY, DEFAULT_REGION } from '@/services/regions';

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

  setSelectedSpot: (id: string | null) => void;
  setCurrentHour: (hour: number) => void;
  setUserSkillLevel: (level: SkillLevel) => void;
  setUserLocation: (lat: number, lon: number) => void;
  setSelectedCountry: (country: string) => void;
  setSelectedRegion: (region: string) => void;
  /** True once geolocation has decided, so it cannot overwrite a manual pick. */
  regionResolved: boolean;
  resolveRegion: (region: string) => void;
  resolveLocation: (country: string, region: string) => void;
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
  spotUtcOffsetSeconds: browserOffsetSeconds(),

  setSelectedSpot: id => set({ selectedSpotId: id }),
  setCurrentHour: hour => set({ currentHour: hour }),
  setUserSkillLevel: level => set({ userSkillLevel: level }),
  setUserLocation: (lat, lon) => set({ userLocation: { lat, lon } }),
  // A manual choice also counts as resolved: a late geolocation callback must
  // not yank the user back to their own coast.
  setSelectedCountry: country => set({ selectedCountry: country, regionResolved: true }),
  setSelectedRegion: region => set({ selectedRegion: region, regionResolved: true }),
  resolveRegion: region =>
    set(state => (state.regionResolved ? state : { selectedRegion: region, regionResolved: true })),
  resolveLocation: (country, region) =>
    set(state =>
      state.regionResolved
        ? state
        : { selectedCountry: country, selectedRegion: region, regionResolved: true }
    ),
  setSpotUtcOffsetSeconds: seconds => set({ spotUtcOffsetSeconds: seconds }),
}));
