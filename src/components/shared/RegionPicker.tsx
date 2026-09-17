'use client';

import React, { useMemo, useState } from 'react';
import { Drawer } from 'vaul';
import { Check, ChevronDown, MapPin, Navigation, Search } from 'lucide-react';
import spots from '@/data/spots.index.json';
import { useStore } from '@/store/useStore';
import { allCountries, locationDefaults, regionsForCountry } from '@/services/regions';
import { qualityTier } from '@/services/conditions';

const SHORT_COUNTRY: Record<string, string> = { 'United Kingdom': 'UK' };

/** Spots per region, counted once from the index. */
function useRegionCounts() {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const spot of spots) counts.set(spot.community, (counts.get(spot.community) ?? 0) + 1);
    return counts;
  }, []);
}

function ScoreChip({ stars }: { stars: number }) {
  const tier = qualityTier(stars);
  const style =
    tier === 'epic'
      ? 'bg-epic text-epic-ink'
      : tier === 'good'
        ? 'bg-fair text-fair-ink'
        : 'bg-card text-ink-2';
  return (
    <span
      className={`min-w-8 h-7 px-2 rounded-lg flex items-center justify-center text-[14px] font-bold tabular-nums ${style}`}
      aria-label={`best today ${stars}`}
    >
      {stars}
    </span>
  );
}

/**
 * Region selection as a sheet: search, the user's own coast, a country at a
 * time. Replaces two native selects that took the bottom panel's best space.
 */
export function RegionPicker() {
  const { selectedCountry, selectedRegion, setSelectedCountry, setSelectedRegion, regionBestToday, setUserLocation } =
    useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState(selectedCountry);
  const counts = useRegionCounts();
  const countries = allCountries();

  const regions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    if (!q) return regionsForCountry(country).map(region => ({ region, country }));
    // A search spans every country: "Cornwall" should not need the UK tab first.
    return countries.flatMap(c =>
      regionsForCountry(c)
        .filter(region => region.toLocaleLowerCase('es').includes(q))
        .map(region => ({ region, country: c }))
    );
  }, [query, country, countries]);

  const choose = (region: string, regionCountry: string) => {
    setSelectedCountry(regionCountry);
    setSelectedRegion(region);
    setOpen(false);
  };

  const useLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setUserLocation(latitude, longitude);
        const nearest = locationDefaults(latitude, longitude);
        choose(nearest.region, nearest.country);
      },
      err => console.warn('Geolocation unavailable:', err.message)
    );
  };

  return (
    <Drawer.Root
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) {
          setCountry(selectedCountry);
          setQuery('');
        }
      }}
    >
      <Drawer.Trigger asChild>
        <button
          type="button"
          data-testid="region-button"
          data-region={selectedRegion}
          data-country={selectedCountry}
          aria-label={`Change region, currently ${selectedRegion}, ${selectedCountry}`}
          className="h-11 flex-1 min-w-0 flex items-center gap-2.5 pl-3.5 pr-3 rounded-full bg-sheet/90 backdrop-blur-md border border-line text-left"
        >
          <MapPin size={16} className="text-ink-2 shrink-0" />
          <span className="flex flex-col min-w-0 leading-tight">
            <span className="text-[15px] font-semibold truncate">{selectedRegion}</span>
            <span className="text-[12px] text-ink-2 truncate">
              {selectedCountry} · {(counts.get(selectedRegion) ?? 0).toLocaleString('en-GB')} spots
            </span>
          </span>
          <ChevronDown size={16} className="text-ink-2 ml-auto shrink-0" />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          data-testid="region-picker"
          className="bg-sheet text-ink-0 flex flex-col rounded-t-3xl fixed bottom-0 left-0 right-0 z-50 h-[88dvh] border-t border-line outline-none max-w-lg mx-auto"
        >
          <div className="mx-auto w-9 h-1 rounded-full bg-zinc-700 mt-2 shrink-0" />
          <div className="px-5 pt-3.5 shrink-0">
            <Drawer.Title className="text-[22px] font-semibold tracking-tight">Choose a region</Drawer.Title>
            <Drawer.Description className="sr-only">
              Search for a region, use your location or browse by country
            </Drawer.Description>

            <label htmlFor="region-search" className="block text-[13px] text-ink-2 mt-3 mb-1.5">
              Search regions
            </label>
            <div className="h-11 flex items-center gap-2.5 px-3.5 rounded-2xl bg-card border border-line focus-within:border-line-strong">
              <Search size={16} className="text-ink-2 shrink-0" />
              <input
                id="region-search"
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Asturias, Bretagne, Cornwall…"
                data-testid="region-search"
                autoComplete="off"
                className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-ink-3"
              />
            </div>

            <button
              type="button"
              onClick={useLocation}
              data-testid="region-use-location"
              className="mt-3 w-full h-13 flex items-center gap-3 px-3.5 rounded-2xl border border-line text-left hover:bg-card transition-colors"
            >
              <Navigation size={17} className="text-ink-1 shrink-0" />
              <span className="flex flex-col leading-tight">
                <span className="text-[15px] font-medium">Use my location</span>
                <span className="text-[13px] text-ink-2">Jump to the nearest coast</span>
              </span>
            </button>

            {!query && (
              <div role="tablist" aria-label="Country" className="mt-4 flex gap-1.5 overflow-x-auto no-scrollbar">
                {countries.map(c => {
                  const active = c === country;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setCountry(c)}
                      data-testid="country-tab"
                      data-country={c}
                      className={`shrink-0 h-9 px-3.5 rounded-full text-[14px] font-medium border transition-colors ${
                        active ? 'bg-ink-0 text-ground border-ink-0' : 'border-line-strong text-ink-1 hover:text-white'
                      }`}
                    >
                      {SHORT_COUNTRY[c] ?? c}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-3.5 flex justify-between text-[13px] text-ink-2">
              <span>
                {regions.length} {regions.length === 1 ? 'region' : 'regions'}
              </span>
              <span>Best today</span>
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto overscroll-contain px-5 mt-1.5 min-h-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {regions.length === 0 && (
              <li className="py-8 text-center text-[14px] text-ink-2">No region matches “{query}”.</li>
            )}
            {regions.map(({ region, country: c }) => {
              const current = region === selectedRegion;
              const best = regionBestToday[region];
              return (
                <li key={`${c}-${region}`} className="border-b border-line">
                  <button
                    type="button"
                    onClick={() => choose(region, c)}
                    aria-current={current ? 'true' : undefined}
                    data-testid="region-option"
                    data-region={region}
                    className="w-full h-14 flex items-center gap-3 text-left"
                  >
                    <span className="flex flex-col flex-1 min-w-0 leading-tight">
                      <span className={`text-[16px] truncate ${current ? 'font-semibold' : 'font-medium'}`}>{region}</span>
                      <span className="text-[13px] text-ink-2">
                        {query ? `${c} · ` : ''}
                        {(counts.get(region) ?? 0).toLocaleString('en-GB')} spots
                      </span>
                    </span>
                    {best !== undefined && <ScoreChip stars={best} />}
                    <span className="w-5 flex justify-center">{current && <Check size={18} strokeWidth={2.5} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
