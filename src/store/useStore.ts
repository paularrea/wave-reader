import { create } from 'zustand';

export type SkillLevel = 'beginner' | 'intermediate' | 'expert';

interface WaveStore {
  selectedSpotId: string | null;
  /** Whole hours after the timeline anchor (next hour on the clock). */
  currentHour: number;
  userSkillLevel: SkillLevel;
  userLocation: { lat: number; lon: number } | null;
  selectedRegion: string | 'all';
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
  setSelectedRegion: (region: string | 'all') => void;
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
  selectedRegion: 'all',
  spotUtcOffsetSeconds: browserOffsetSeconds(),

  setSelectedSpot: id => set({ selectedSpotId: id }),
  setCurrentHour: hour => set({ currentHour: hour }),
  setUserSkillLevel: level => set({ userSkillLevel: level }),
  setUserLocation: (lat, lon) => set({ userLocation: { lat, lon } }),
  setSelectedRegion: region => set({ selectedRegion: region }),
  setSpotUtcOffsetSeconds: seconds => set({ spotUtcOffsetSeconds: seconds }),
}));
