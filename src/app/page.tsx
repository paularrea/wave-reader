'use client';

import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { MarineMap } from '@/components/shared/MarineMap';
import { SpotDetailDrawer } from '@/components/shared/SpotDetailDrawer';
import { DataInfoPanel } from '@/components/shared/DataInfoPanel';
import { useStore } from '@/store/useStore';
import { instantAt, dayLabel, compactDayLabel, MAX_FORECAST_HOURS } from '@/services/timeline';
import { allCountries, regionsForCountry } from '@/services/regions';
import { useSpotSeries } from '@/hooks/useSpotSeries';

/** Groups the timeline's hours into days so the strip can show one chip per day. */
function useDaySegments(utcOffsetSeconds: number) {
  return useMemo(() => {
    const now = new Date();
    const segments: Array<{ day: string; label: string; startHour: number }> = [];

    for (let hour = 0; hour <= MAX_FORECAST_HOURS; hour++) {
      const instant = instantAt(utcOffsetSeconds, hour, now);
      if (segments[segments.length - 1]?.day === instant.day) continue;
      segments.push({
        day: instant.day,
        label: compactDayLabel(instant, utcOffsetSeconds, now),
        startHour: hour,
      });
    }
    return segments;
  }, [utcOffsetSeconds]);
}

export default function WaveReaderPage() {
  const {
    userSkillLevel,
    setUserSkillLevel,
    currentHour,
    setCurrentHour,
    selectedSpotId,
    selectedCountry,
    setSelectedCountry,
    selectedRegion,
    setSelectedRegion,
    spotUtcOffsetSeconds,
    setSpotUtcOffsetSeconds,
  } = useStore();

  /**
   * The spot's whole horizon, loaded once per spot and level. Stepping through
   * hours reads from it locally; failures retry and then surface in the drawer.
   */
  const series = useSpotSeries(selectedSpotId, userSkillLevel);

  /**
   * Everything time-dependent renders only after hydration. The server has no
   * idea what "now" is in the viewer's timezone, so rendering the timeline
   * during SSR guarantees a hydration text mismatch (React #418).
   */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Labels follow the spot's own timezone once its forecast says what it is.
  const seriesOffset = series.status === 'ready' ? series.data.utcOffsetSeconds : null;
  useEffect(() => {
    if (seriesOffset !== null) setSpotUtcOffsetSeconds(seriesOffset);
  }, [seriesOffset, setSpotUtcOffsetSeconds]);

  const daySegments = useDaySegments(spotUtcOffsetSeconds);
  const instant = instantAt(spotUtcOffsetSeconds, currentHour);
  const { label: currentDayLabel } = dayLabel(instant, spotUtcOffsetSeconds);
  const countries = allCountries();
  const regions = regionsForCountry(selectedCountry);

  /** Switching country lands on its first region rather than an empty map. */
  const onCountryChange = (country: string) => {
    setSelectedCountry(country);
    const first = regionsForCountry(country)[0];
    if (first) setSelectedRegion(first);
  };

  return (
    /* dvh, not vh: on mobile the browser chrome makes vh taller than the visible
       area, which pushes the controls off-screen and creates a scrollbar. */
    <main className="relative w-full h-[100dvh] overflow-hidden bg-zinc-950 text-white font-sans">
      <div className="absolute inset-0 z-0">
        <MarineMap />
      </div>

      <header className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between p-4 pointer-events-none">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-none drop-shadow-lg">
            WAVE<span className="text-blue-500">READER</span>
          </h1>
          <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-[0.18em] mt-1">
            Marine Forecast
          </p>
        </div>
        {/* The legend lives inside the info panel: on a phone a permanent box
            over the map cost more than it explained. */}
        <div className="pointer-events-auto">
          <DataInfoPanel />
        </div>
      </header>

      <div
        className="absolute bottom-0 left-0 right-0 z-20 px-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto w-full max-w-md bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-3 shadow-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <select
              aria-label="Country"
              data-testid="country-select"
              value={selectedCountry}
              onChange={e => onCountryChange(e.target.value)}
              className="shrink-0 bg-zinc-900 border border-zinc-800 text-[13px] font-semibold rounded-lg px-2.5 py-2 text-zinc-100 focus:ring-1 focus:ring-blue-500 outline-none appearance-none"
            >
              {countries.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Region"
              data-testid="region-select"
              value={selectedRegion}
              onChange={e => setSelectedRegion(e.target.value)}
              className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 text-[13px] font-semibold rounded-lg px-2.5 py-2 text-zinc-100 focus:ring-1 focus:ring-blue-500 outline-none appearance-none"
            >
              {regions.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <div className="flex bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg shrink-0">
              {(['beginner', 'intermediate', 'expert'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => setUserSkillLevel(level)}
                  data-testid={`level-${level}`}
                  title={level}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase transition-colors ${
                    userSkillLevel === level
                      ? 'bg-white text-zinc-950'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {level.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* The day strip gets a full row of its own: sharing one with the
                time label clipped the last chip against it. */}
            <div
              className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-testid="day-strip"
            >
              {mounted &&
                daySegments.map(segment => {
                  const isActive = segment.day === instant.day;
                  return (
                    <button
                      key={segment.day}
                      onClick={() => setCurrentHour(segment.startHour)}
                      data-testid="day-chip"
                      data-active={isActive}
                      className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-colors ${
                        isActive
                          ? 'bg-white text-zinc-950'
                          : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {segment.label}
                    </button>
                  );
                })}
            </div>

            <div className="flex items-center gap-3">
              <span
                className="text-[12px] font-bold tabular-nums text-zinc-100 shrink-0 w-[92px]"
                data-testid="forecast-time"
              >
                {mounted ? `${currentDayLabel}, ${String(instant.hour).padStart(2, '0')}:00` : '—'}
              </span>
              <input
                type="range"
                aria-label="Forecast hour"
                min={0}
                max={MAX_FORECAST_HOURS}
                step={1}
                value={currentHour}
                className="flex-1 accent-blue-500 h-1 bg-zinc-800 rounded-full cursor-pointer"
                onChange={e => setCurrentHour(Number.parseInt(e.target.value, 10))}
              />
            </div>
          </div>
        </div>
      </div>

      <SpotDetailDrawer series={series} />
    </main>
  );
}
