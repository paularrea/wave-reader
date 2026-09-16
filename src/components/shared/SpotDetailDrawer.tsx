'use client';

import React, { useMemo } from 'react';
import { Drawer } from 'vaul';
import { useStore } from '@/store/useStore';
import spots from '@/data/spots.json';
import { Navigation, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { MarineForecast } from '@/services/marine-api';
import { TideExtreme } from '@/services/tides';
import { SpotConfig } from '@/services/star-engine';
import { qualityStyle, swellColor, windBadge, compassPoint, MAX_STARS } from '@/services/conditions';
import { instantAt, compactDayLabel, MAX_FORECAST_HOURS } from '@/services/timeline';
import { DirectionArrow } from './DirectionArrow';

export interface ForecastPayload {
  stars: number;
  unrated: boolean;
  safety: { isDangerous: boolean; reason: string | null };
  forecast: MarineForecast;
  tides: TideExtreme[];
}

interface SpotDetailDrawerProps {
  forecastData: ForecastPayload | null;
}

const NO_DATA = '—';

function metres(value: number | null, digits = 1): string {
  return value === null ? NO_DATA : `${value.toFixed(digits)}m`;
}

function seconds(value: number | null): string {
  return value === null ? NO_DATA : `${Math.round(value)}s`;
}

/** One reading: big value, small unit, optional bearing arrow. */
function Metric({
  label,
  value,
  sub,
  color,
  fromDegrees,
  testId,
  subTestId,
  badge,
}: {
  label: string;
  value: string;
  sub?: string | null;
  color?: string;
  fromDegrees?: number | null;
  testId?: string;
  subTestId?: string;
  /** Sits with the reading it qualifies, not in a section of its own. */
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-1.5">
        {label}
      </div>
      <div
        className="text-xl font-semibold leading-none tabular-nums truncate"
        style={color ? { color } : undefined}
        data-testid={testId}
      >
        {value}
      </div>
      {(sub || fromDegrees != null) && (
        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-zinc-400 font-medium">
          {fromDegrees != null && <DirectionArrow fromDegrees={fromDegrees} size={11} />}
          <span className="truncate" data-testid={subTestId}>
            {sub}
          </span>
        </div>
      )}
      {badge && <div className="mt-2">{badge}</div>}
    </div>
  );
}

function TideRow({ tide }: { tide: TideExtreme }) {
  const isHigh = tide.kind === 'high';
  return (
    <div
      className="flex items-baseline justify-between py-2 text-sm"
      data-testid={`tide-${tide.kind}`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`inline-block w-1 h-1 rounded-full ${isHigh ? 'bg-sky-300' : 'bg-zinc-600'}`}
        />
        <span className={isHigh ? 'text-zinc-200 font-medium' : 'text-zinc-400'}>
          {isHigh ? 'High' : 'Low'}
        </span>
      </span>
      <span className="flex items-baseline gap-3 tabular-nums">
        <span className="text-zinc-100 font-medium">{tide.timestamp.slice(11, 16)}</span>
        <span className="text-zinc-600 text-xs w-12 text-right">{tide.heightM.toFixed(2)}m</span>
      </span>
    </div>
  );
}

export function SpotDetailDrawer({ forecastData }: SpotDetailDrawerProps) {
  const { selectedSpotId, setSelectedSpot, currentHour, setCurrentHour, spotUtcOffsetSeconds } =
    useStore();
  const spot = spots.find(s => s.id === selectedSpotId);

  const instant = instantAt(spotUtcOffsetSeconds, currentHour);

  /** The days reachable from the drawer, and the offset that opens each one. */
  const days = useMemo(() => {
    const now = new Date();
    const seen: Array<{ day: string; label: string; startHour: number }> = [];
    for (let hour = 0; hour <= MAX_FORECAST_HOURS; hour++) {
      const at = instantAt(spotUtcOffsetSeconds, hour, now);
      if (seen[seen.length - 1]?.day === at.day) continue;
      seen.push({
        day: at.day,
        label: compactDayLabel(at, spotUtcOffsetSeconds, now),
        startHour: hour,
      });
    }
    return seen;
  }, [spotUtcOffsetSeconds]);

  if (!spot) return null;

  const forecast = forecastData?.forecast ?? null;
  const badge = forecast ? windBadge(forecast, spot.config as SpotConfig) : null;
  const isDangerous = forecastData?.safety.isDangerous ?? false;
  const quality = forecastData
    ? qualityStyle(forecastData.stars, { isDangerous, unrated: forecastData.unrated })
    : null;

  /** Keeps the hour of day when jumping to another day, so comparison is fair. */
  const goToDay = (startHour: number) => {
    const target = instantAt(spotUtcOffsetSeconds, startHour);
    const keepHour = instant.hour;
    setCurrentHour(Math.min(MAX_FORECAST_HOURS, startHour + ((keepHour - target.hour + 24) % 24)));
  };

  const stepHour = (delta: number) =>
    setCurrentHour(Math.min(MAX_FORECAST_HOURS, Math.max(0, currentHour + delta)));

  return (
    <Drawer.Root open={!!selectedSpotId} onOpenChange={open => !open && setSelectedSpot(null)}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          data-testid="spot-drawer"
          className="bg-zinc-950 text-white flex flex-col rounded-t-3xl fixed bottom-0 left-0 right-0 z-50 max-h-[88dvh] border-t border-zinc-800 outline-none"
        >
          <div className="mx-auto w-9 h-1 rounded-full bg-zinc-700 mt-3 mb-1 shrink-0" />

          {/* Header: name and score, always visible above the scroll area. */}
          <div className="px-5 pt-3 pb-4 shrink-0">
            <Drawer.Title className="sr-only">{spot.name}</Drawer.Title>
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-[22px] font-semibold leading-tight truncate">{spot.name}</h2>
                <p className="text-zinc-500 text-[13px] mt-0.5 truncate">
                  {spot.community} · {spot.type}
                </p>
              </div>

              {/* The score reads as one object: number, scale and verdict. */}
              <div
                className="shrink-0 flex flex-col items-center rounded-2xl px-3.5 py-2 min-w-[74px]"
                data-testid="spot-quality"
                style={{
                  backgroundColor:
                    quality && quality.tier !== 'poor' && quality.tier !== 'unrated'
                      ? quality.background
                      : '#18181B',
                  border:
                    quality && (quality.tier === 'poor' || quality.tier === 'unrated')
                      ? '1px solid #27272A'
                      : 'none',
                }}
              >
                <span
                  className="text-3xl font-bold leading-none tabular-nums"
                  data-testid="spot-score"
                  style={{
                    color:
                      quality && quality.tier !== 'poor' && quality.tier !== 'unrated'
                        ? quality.foreground
                        : '#A1A1AA',
                  }}
                >
                  {forecastData && !forecastData.unrated ? forecastData.stars : NO_DATA}
                </span>
                <span
                  className="text-[9px] uppercase tracking-[0.14em] font-bold mt-1"
                  data-testid="spot-tier"
                  style={{
                    color:
                      quality && quality.tier !== 'poor' && quality.tier !== 'unrated'
                        ? quality.foreground
                        : '#71717A',
                    opacity: 0.85,
                  }}
                >
                  {quality ? quality.label : `/ ${MAX_STARS}`}
                </span>
              </div>
            </div>
          </div>

          {/* Day and hour navigation, so the forecast can be browsed in place. */}
          <div className="px-5 pb-3 shrink-0 border-b border-zinc-900">
            <div
              className="flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-testid="drawer-day-tabs"
            >
              {days.map(day => {
                const isActive = day.day === instant.day;
                return (
                  <button
                    key={day.day}
                    onClick={() => goToDay(day.startHour)}
                    data-testid="drawer-day-tab"
                    data-active={isActive}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      isActive
                        ? 'bg-white text-zinc-950'
                        : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => stepHour(-1)}
                disabled={currentHour === 0}
                aria-label="Previous hour"
                data-testid="hour-prev"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span
                className="text-sm font-semibold tabular-nums text-zinc-200"
                data-testid="drawer-time"
              >
                {String(instant.hour).padStart(2, '0')}:00
              </span>
              <button
                onClick={() => stepHour(1)}
                disabled={currentHour >= MAX_FORECAST_HOURS}
                aria-label="Next hour"
                data-testid="hour-next"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Only this region scrolls, so the header and the action stay put. */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 min-h-0">
            {isDangerous && (
              <div
                data-testid="danger-alert"
                className="bg-red-500/10 border border-red-500/50 text-red-200 p-3.5 rounded-xl flex gap-3 items-start mb-5"
              >
                <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-400" />
                <div className="text-[12px] leading-relaxed">
                  <span className="font-semibold block mb-1 text-red-300">Above your level</span>
                  {forecastData?.safety.reason}
                </div>
              </div>
            )}

            <div className="flex gap-4 pb-5 border-b border-zinc-900">
              <Metric
                label="Swell"
                value={forecast ? metres(forecast.swellHeight) : NO_DATA}
                sub={forecast ? (compassPoint(forecast.swellDirection) ?? NO_DATA) : undefined}
                fromDegrees={forecast?.swellDirection ?? null}
                color={swellColor(forecast?.swellHeight ?? null)}
                testId="swell-height"
                subTestId="swell-direction"
              />
              <Metric
                label="Period"
                value={forecast ? seconds(forecast.swellPeriod) : NO_DATA}
              />
              <Metric
                label="Wind"
                value={
                  forecast
                    ? forecast.windSpeed === null
                      ? 'No data'
                      : `${Math.round(forecast.windSpeed)} km/h`
                    : NO_DATA
                }
                sub={
                  forecast && forecast.windSpeed !== null
                    ? (compassPoint(forecast.windDirection) ?? undefined)
                    : undefined
                }
                fromDegrees={forecast?.windDirection ?? null}
                testId="wind-reading"
                subTestId="wind-direction"
                badge={
                  badge ? (
                    <span
                      data-testid="wind-badge"
                      className="text-[10px] px-2 py-0.5 rounded font-bold"
                      style={{ backgroundColor: badge.background, color: badge.foreground }}
                    >
                      {badge.label}
                    </span>
                  ) : null
                }
              />
            </div>

            <section className="py-4 border-b border-zinc-900" data-testid="tides-section">
              <h3 className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-1">
                Tides
              </h3>
              {forecastData && forecastData.tides.length > 0 ? (
                <>
                  <div className="divide-y divide-zinc-900/80">
                    {forecastData.tides.map(tide => (
                      <TideRow key={`${tide.kind}-${tide.timestamp}`} tide={tide} />
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-2">
                    From hourly sea level · ±30 min
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500 py-2">No data</p>
              )}
            </section>

            <section className="py-4">
              <h3 className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-2">
                Sea state
              </h3>
              <dl className="text-sm">
                {[
                  {
                    key: 'secondary-swell',
                    term: 'Secondary swell',
                    height: forecast?.secondarySwellHeight ?? null,
                    period: forecast?.secondarySwellPeriod ?? null,
                    direction: forecast?.secondarySwellDirection ?? null,
                  },
                  {
                    key: 'wind-waves',
                    term: 'Wind waves',
                    height: forecast?.windWaveHeight ?? null,
                    period: forecast?.windWavePeriod ?? null,
                    direction: forecast?.windWaveDirection ?? null,
                  },
                ].map(row => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-4 py-2 border-b border-zinc-900/80 last:border-0"
                    data-testid={row.key}
                  >
                    <dt className="text-zinc-500">{row.term}</dt>
                    <dd className="flex items-center gap-1.5 font-medium tabular-nums text-zinc-200">
                      {row.height === null ? (
                        NO_DATA
                      ) : (
                        <>
                          <DirectionArrow fromDegrees={row.direction} size={11} />
                          <span>
                            {metres(row.height)} · {seconds(row.period)}
                          </span>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-zinc-500">Sea level</dt>
                  <dd className="font-medium tabular-nums text-zinc-200">
                    {forecast ? metres(forecast.seaLevel, 2) : NO_DATA}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          {/* Pinned: the action was previously below the fold and unreachable. */}
          <div
            className="shrink-0 px-5 pt-3 border-t border-zinc-900 bg-zinc-950"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${spot.coordinates.lat},${spot.coordinates.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="go-to-spot"
              className="w-full bg-white text-zinc-950 py-3.5 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <Navigation size={17} />
              Go to Spot
            </a>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
