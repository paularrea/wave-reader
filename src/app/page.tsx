'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import { MarineMap } from '@/components/shared/MarineMap';
import { SpotDetailDrawer, ForecastPayload } from '@/components/shared/SpotDetailDrawer';
import { useStore } from '@/store/useStore';
import { Calendar, User, MapPin } from 'lucide-react';
import spots from '@/data/spots.json';
import { instantAt, dayLabel, MAX_FORECAST_HOURS } from '@/services/timeline';

/** Groups the timeline's hours into days so the strip can show one chip per day. */
function useDaySegments(utcOffsetSeconds: number) {
  return useMemo(() => {
    const now = new Date();
    const segments: Array<{ day: string; label: string; startHour: number; hours: number }> = [];

    for (let hour = 0; hour <= MAX_FORECAST_HOURS; hour++) {
      const instant = instantAt(utcOffsetSeconds, hour, now);
      const last = segments[segments.length - 1];
      if (last && last.day === instant.day) {
        last.hours += 1;
      } else {
        segments.push({
          day: instant.day,
          label: dayLabel(instant, utcOffsetSeconds, now).label,
          startHour: hour,
          hours: 1,
        });
      }
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
    selectedRegion,
    setSelectedRegion,
    spotUtcOffsetSeconds,
    setSpotUtcOffsetSeconds,
  } = useStore();

  /** Keyed by spot so a slow response can never paint onto a different spot. */
  const [loaded, setLoaded] = useState<{ spotId: string; payload: ForecastPayload } | null>(null);
  const forecastData = loaded && loaded.spotId === selectedSpotId ? loaded.payload : null;

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

  useEffect(() => {
    if (!selectedSpotId) return;

    const spotId = selectedSpotId;
    let cancelled = false;

    async function fetchDetails() {
      try {
        const res = await fetch(
          `/api/forecast?spotId=${spotId}&level=${userSkillLevel}&hour=${currentHour}`
        );
        const data = await res.json();
        if (cancelled || data.error) return;

        setLoaded({
          spotId,
          payload: {
            stars: data.stars,
            unrated: data.unrated ?? false,
            safety: data.safety,
            forecast: data.forecast,
            tides: data.tides ?? [],
          },
        });

        // Adopt the spot's timezone so the timeline reads in local time.
        if (typeof data.utcOffsetSeconds === 'number') {
          setSpotUtcOffsetSeconds(data.utcOffsetSeconds);
        }
      } catch (e) {
        console.error('Error fetching spot details:', e);
      }
    }

    fetchDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedSpotId, userSkillLevel, currentHour, setSpotUtcOffsetSeconds]);

  const daySegments = useDaySegments(spotUtcOffsetSeconds);
  const instant = instantAt(spotUtcOffsetSeconds, currentHour);
  const { label: currentDayLabel } = dayLabel(instant, spotUtcOffsetSeconds);
  const regions = ['all', ...Array.from(new Set(spots.map(s => s.community)))];

  return (
    <main className="relative w-full h-screen overflow-hidden bg-zinc-950 text-white font-sans">
      <div className="absolute inset-0 z-0">
        <MarineMap />
      </div>

      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h1 className="text-3xl font-black tracking-tighter italic flex items-center gap-2 drop-shadow-lg">
          WAVE<span className="text-blue-500">READER</span>
        </h1>
        <p className="text-xs text-zinc-400 font-medium uppercase tracking-widest">
          Pro Marine Forecast
        </p>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4">
        <div className="bg-zinc-900/85 backdrop-blur-md border border-zinc-800 p-4 rounded-3xl shadow-2xl flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <MapPin size={18} className="text-zinc-500 shrink-0" />
            <select
              aria-label="Region"
              value={selectedRegion}
              onChange={e => setSelectedRegion(e.target.value)}
              className="flex-1 bg-zinc-800 border-none text-xs font-bold rounded-lg px-3 py-1.5 text-zinc-200 focus:ring-2 ring-blue-500 outline-none"
            >
              {regions.map(r => (
                <option key={r} value={r}>
                  {r === 'all' ? 'All Regions' : r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-500">
                <Calendar size={18} />
                <span className="text-xs font-bold uppercase tracking-tighter">Forecast</span>
              </div>
              <span
                className="text-xs font-mono text-blue-400 font-bold"
                data-testid="forecast-time"
              >
                {mounted ? `${currentDayLabel}, ${String(instant.hour).padStart(2, '0')}:00` : '--'}
              </span>
            </div>

            {/* One chip per day; width tracks how many of the day's hours are
                inside the window, so the strip lines up with the slider. */}
            <div className="flex gap-1" data-testid="day-strip">
              {mounted && daySegments.map(segment => {
                const isActive = segment.day === instant.day;
                return (
                  <button
                    key={segment.day}
                    onClick={() => setCurrentHour(segment.startHour)}
                    style={{ flexGrow: segment.hours }}
                    data-testid="day-chip"
                    data-active={isActive}
                    className={`text-[9px] font-bold uppercase tracking-tight py-1 rounded-md transition-colors truncate px-1 ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {segment.label}
                  </button>
                );
              })}
            </div>

            <input
              type="range"
              aria-label="Forecast hour"
              min={0}
              max={MAX_FORECAST_HOURS}
              step={1}
              value={currentHour}
              className="w-full accent-blue-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
              onChange={e => setCurrentHour(Number.parseInt(e.target.value, 10))}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-zinc-500">
              <User size={18} />
              <span className="text-xs font-medium uppercase">Level</span>
            </div>
            <div className="flex bg-zinc-800 p-1 rounded-xl">
              {(['beginner', 'intermediate', 'expert'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => setUserSkillLevel(level)}
                  data-testid={`level-${level}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    userSkillLevel === level
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SpotDetailDrawer forecastData={forecastData} />
    </main>
  );
}
