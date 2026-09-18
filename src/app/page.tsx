'use client';

import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { MarineMap } from '@/components/shared/MarineMap';
import { SpotDetailDrawer } from '@/components/shared/SpotDetailDrawer';
import { DataInfoPanel } from '@/components/shared/DataInfoPanel';
import { RegionPicker } from '@/components/shared/RegionPicker';
import { LevelPicker } from '@/components/shared/LevelPicker';
import { useStore } from '@/store/useStore';
import { instantAt, dayLabel, compactDayLabel, MAX_FORECAST_HOURS } from '@/services/timeline';
import { qualityTier } from '@/services/conditions';
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

const TIER_FILL: Record<string, string> = {
  epic: 'bg-epic text-epic-ink',
  good: 'bg-fair text-fair-ink',
  poor: 'bg-zinc-700 text-ink-1',
};
const TIER_BAR: Record<string, string> = {
  epic: 'bg-epic',
  good: 'bg-fair',
  poor: 'bg-zinc-700',
};

export default function WaveReaderPage() {
  const {
    userSkillLevel,
    currentHour,
    setCurrentHour,
    selectedSpotId,
    setSelectedSpot,
    spotUtcOffsetSeconds,
    setSpotUtcOffsetSeconds,
    mapSummary,
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

  /**
   * The sheet's height, published to CSS so Mapbox's logo and credits can sit
   * just above it. The sheet grows and shrinks with what it has to show, so a
   * fixed offset would either cover them or float them in mid-air.
   */
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || typeof ResizeObserver === 'undefined') return;
    const publish = () =>
      document.documentElement.style.setProperty('--sheet-height', `${Math.round(sheet.offsetHeight)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(sheet);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--sheet-height');
    };
  }, []);

  const daySegments = useDaySegments(spotUtcOffsetSeconds);
  const instant = instantAt(spotUtcOffsetSeconds, currentHour);
  const { label: currentDayLabel } = dayLabel(instant, spotUtcOffsetSeconds);
  const best = mapSummary.best.filter(spot => spot.stars > 0);
  const progress = `${(currentHour / MAX_FORECAST_HOURS) * 100}%`;

  return (
    /* dvh, not vh: on mobile the browser chrome makes vh taller than the visible
       area, which pushes the controls off-screen and creates a scrollbar. */
    <main className="relative w-full h-[100dvh] overflow-hidden bg-ground text-ink-0">
      <h1 className="sr-only">Wave Reader surf forecast</h1>
      <div className="absolute inset-0 z-0">
        <MarineMap />
      </div>

      <header className="absolute top-0 left-0 right-0 z-10 px-4 pt-3.5 pointer-events-none">
        <div className="mx-auto max-w-md flex items-center gap-2 pointer-events-auto">
          <RegionPicker />
          <LevelPicker />
          <DataInfoPanel />
        </div>
      </header>

      <section aria-label="Forecast controls" className="absolute bottom-0 left-0 right-0 z-20">
        <div
          ref={sheetRef}
          data-testid="forecast-sheet"
          className="mx-auto w-full max-w-md bg-sheet border-t border-x border-line rounded-t-3xl pt-2 flex flex-col gap-3.5"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="w-9 h-1 rounded-full bg-zinc-700 self-center" aria-hidden />

          {/* Only when there is something to go to: with nothing surfable the
              section is dropped rather than shown empty, giving the map back
              its height on a phone. */}
          {best.length > 0 && (
            <>
              <div className="flex flex-col gap-2.5" data-testid="best-in-view">
                <div className="flex items-baseline justify-between px-5">
                  <h2 className="text-[15px] font-semibold">Best in view</h2>
                  <span className="text-[13px] text-ink-2 tabular-nums" data-testid="rated-count">
                    {mapSummary.rated > 0 ? `${mapSummary.rated.toLocaleString('en-GB')} spots rated` : ''}
                  </span>
                </div>
                <ul className="flex gap-2 px-5 overflow-x-auto no-scrollbar">
                  {best.map(spot => {
                    const tier = qualityTier(spot.stars, { isDangerous: spot.isDangerous });
                    const detail = [
                      spot.heightM !== null ? `${spot.heightM.toFixed(1)} m` : null,
                      spot.periodS !== null ? `${spot.periodS} s` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <li key={spot.id} className="shrink-0">
                        <button
                          type="button"
                          data-testid="best-spot"
                          data-spot-id={spot.id}
                          // Ranked for this hour, so it opens at this hour.
                          onClick={() => setSelectedSpot(spot.id, { keepHour: true })}
                          className="h-14 flex items-center gap-2.5 pl-2 pr-3.5 rounded-2xl bg-card border border-line text-left hover:bg-raised transition-colors"
                        >
                          <span
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-[17px] font-bold tabular-nums ${
                              tier === 'danger' ? 'bg-alert text-white' : TIER_FILL[tier]
                            }`}
                          >
                            {spot.stars}
                          </span>
                          <span className="flex flex-col leading-tight">
                            <span className="text-[14px] font-semibold whitespace-nowrap max-w-[150px] truncate">
                              {spot.name}
                            </span>
                            <span className="text-[12px] text-ink-2 whitespace-nowrap tabular-nums">{detail}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="h-px bg-line mx-5" />
            </>
          )}

          <div className="flex flex-col gap-2.5 px-5">
            <div className="flex items-center justify-between h-8">
              <span className="text-[17px] font-semibold tabular-nums" data-testid="forecast-time">
                {mounted ? `${currentDayLabel}, ${String(instant.hour).padStart(2, '0')}:00` : '—'}
              </span>
              {mounted && currentHour > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentHour(0)}
                  data-testid="back-to-now"
                  className="h-8 px-3 rounded-full border border-line-strong text-[13px] font-medium text-ink-1 hover:text-white transition-colors"
                >
                  Back to now
                </button>
              )}
            </div>

            <div className="grid grid-cols-7 gap-1" data-testid="day-strip">
              {mounted &&
                daySegments.slice(0, 7).map(segment => {
                  const isActive = segment.day === instant.day;
                  const dayBest = mapSummary.bestByDay[segment.day];
                  const known = dayBest !== undefined && dayBest >= 0;
                  return (
                    <button
                      key={segment.day}
                      type="button"
                      onClick={() => setCurrentHour(segment.startHour)}
                      data-testid="day-chip"
                      data-active={isActive}
                      data-best={known ? dayBest : ''}
                      aria-pressed={isActive}
                      aria-label={`${segment.label}${known ? `, best score ${dayBest}` : ''}`}
                      className={`h-12 rounded-xl flex flex-col items-center justify-center gap-1.5 border transition-colors ${
                        isActive
                          ? 'bg-raised border-ink-0 text-white'
                          : 'border-transparent text-ink-2 hover:text-ink-0'
                      }`}
                    >
                      <span className="text-[12px] font-medium leading-none">{segment.label}</span>
                      <span
                        className={`w-[18px] h-1 rounded-full ${known ? TIER_BAR[qualityTier(dayBest)] : 'bg-zinc-800'}`}
                        aria-hidden
                      />
                    </button>
                  );
                })}
            </div>

            <input
              type="range"
              aria-label="Forecast hour"
              aria-valuetext={mounted ? `${currentDayLabel}, ${String(instant.hour).padStart(2, '0')}:00` : undefined}
              min={0}
              max={MAX_FORECAST_HOURS}
              step={1}
              value={currentHour}
              className="time-slider w-full"
              style={{ '--progress': progress } as React.CSSProperties}
              onChange={e => setCurrentHour(Number.parseInt(e.target.value, 10))}
            />
          </div>
        </div>
      </section>

      <SpotDetailDrawer series={series} />
    </main>
  );
}
