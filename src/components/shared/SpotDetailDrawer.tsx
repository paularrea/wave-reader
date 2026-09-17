'use client';

import React, { useMemo, useState } from 'react';
import { Drawer } from 'vaul';
import { useStore } from '@/store/useStore';
import spots from '@/data/spots.index.json';
import { Navigation, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, RotateCw } from 'lucide-react';
import { MarineForecast } from '@/services/marine-api';
import { TideExtreme } from '@/services/tides';
import { SpotConfig } from '@/services/star-engine';
import { qualityStyle, swellColor, windBadge, compassPoint } from '@/services/conditions';
import { instantAt, dayLabel, MAX_FORECAST_HOURS } from '@/services/timeline';
import { buildTimeline, TimelineDay, SeriesHour } from '@/services/forecast-series';
import { verdict, bestWindow, periodClass } from '@/services/verdict';
import type { SeriesState } from '@/hooks/useSpotSeries';
import { DirectionArrow } from './DirectionArrow';
import { ForecastTimeline, ForecastTimelineSkeleton } from './ForecastTimeline';

export interface ForecastPayload {
  stars: number;
  /** Score the swell alone would earn with perfect wind: the "faded stars". */
  swellStars: number;
  energyKj: number | null;
  breakingHeightM: number | null;
  unrated: boolean;
  safety: { isDangerous: boolean; reason: string | null };
  forecast: MarineForecast;
  tides: TideExtreme[];
  /** Comes with the response: the client index carries no surf config. */
  config: SpotConfig | null;
}

interface SpotDetailDrawerProps {
  series: SeriesState & { retry: () => void };
}

const NO_DATA = '—';

function metres(value: number | null, digits = 1): string {
  return value === null ? NO_DATA : `${value.toFixed(digits)}m`;
}

function seconds(value: number | null): string {
  return value === null ? NO_DATA : `${Math.round(value)}s`;
}

/** One reading as a card: small label, big value, one qualifier line. */
function MetricCard({
  label,
  value,
  color,
  testId,
  aside,
  children,
}: {
  label: string;
  value: string;
  color?: string;
  testId?: string;
  /** Sits opposite the label: a bearing, typically. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-card px-3 py-3">
      <div className="flex items-center justify-between gap-1 text-[12px] text-ink-2">
        <span>{label}</span>
        {aside}
      </div>
      <div
        className="text-[20px] font-semibold leading-tight mt-1 tabular-nums truncate"
        style={color ? { color } : undefined}
        data-testid={testId}
      >
        {value}
      </div>
      {children && <div className="mt-1.5 min-h-5 flex items-center">{children}</div>}
    </div>
  );
}

/**
 * The day's sea level as a curve, with the hour shown marked, so "rising
 * towards high at 15:00" is seen rather than computed from a list.
 */
function TideCard({
  hours,
  day,
  currentKey,
  tides,
}: {
  hours: SeriesHour[];
  day: string;
  currentKey: string;
  tides: TideExtreme[];
}) {
  const points = hours
    .filter(h => h.forecast.timestamp.startsWith(day) && h.forecast.seaLevel !== null)
    .map(h => ({ hour: Number.parseInt(h.forecast.timestamp.slice(11, 13), 10), level: h.forecast.seaLevel as number, key: h.forecast.timestamp }));

  const next = tides.find(t => t.timestamp > currentKey);
  const trend = next ? `${next.kind === 'high' ? 'Rising' : 'Falling'} · ${next.kind} ${next.timestamp.slice(11, 16)}` : null;

  const W = 320;
  const H = 44;
  let path = '';
  let marker: { x: number; y: number } | null = null;
  if (points.length >= 2) {
    const min = Math.min(...points.map(p => p.level));
    const max = Math.max(...points.map(p => p.level));
    const span = max - min || 1;
    const x = (hour: number) => (hour / 23) * W;
    const y = (level: number) => 4 + (1 - (level - min) / span) * (H - 8);
    path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.hour).toFixed(1)} ${y(p.level).toFixed(1)}`).join(' ');
    const current = points.find(p => p.key === currentKey);
    if (current) marker = { x: x(current.hour), y: y(current.level) };
  }

  return (
    <section className="rounded-2xl bg-card px-3.5 py-3" data-testid="tides-section" aria-label="Tides">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] text-ink-2 font-normal">Tide</h3>
        {tides.length > 0 && trend && (
          <span className="text-[13px] text-ink-1 tabular-nums" data-testid="tide-trend">
            {trend}
          </span>
        )}
      </div>
      {tides.length === 0 ? (
        <p className="text-[14px] text-ink-2 py-2">No data</p>
      ) : (
        <>
          {path && (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-11 mt-1.5 overflow-visible"
              role="img"
              aria-label={`Tide curve: ${tides.map(t => `${t.kind} ${t.timestamp.slice(11, 16)}`).join(', ')}`}
            >
              <path d={path} fill="none" stroke="#7DD3FC" strokeWidth={2} strokeLinejoin="round" />
              {marker && (
                <>
                  <line x1={marker.x} y1={0} x2={marker.x} y2={H} stroke="rgba(255,255,255,0.3)" strokeDasharray="2 3" />
                  <circle cx={marker.x} cy={marker.y} r={4} fill="#FFFFFF" />
                </>
              )}
            </svg>
          )}
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] tabular-nums">
            {tides.map(tide => (
              <span key={`${tide.kind}-${tide.timestamp}`} data-testid={`tide-${tide.kind}`} className="text-ink-2">
                <span className={tide.kind === 'high' ? 'text-ink-1' : ''}>{tide.kind === 'high' ? 'High' : 'Low'}</span>{' '}
                <span className="text-ink-0">{tide.timestamp.slice(11, 16)}</span>{' '}
                <span className="text-ink-3">{tide.heightM.toFixed(2)}m</span>
              </span>
            ))}
          </div>
          <p className="text-[12px] text-ink-3 mt-1.5">From hourly sea level · ±30 min</p>
        </>
      )}
    </section>
  );
}

function DetailRow({ term, testId, children }: { term: string; testId?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0" data-testid={testId}>
      <dt className="text-[14px] text-ink-2">{term}</dt>
      <dd className="flex items-center gap-1.5 text-[14px] font-medium tabular-nums text-ink-0">{children}</dd>
    </div>
  );
}

export function SpotDetailDrawer({ series }: SpotDetailDrawerProps) {
  const { selectedSpotId, setSelectedSpot, currentHour, setCurrentHour, spotUtcOffsetSeconds } = useStore();
  const spot = spots.find(s => s.id === selectedSpotId);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const instant = instantAt(spotUtcOffsetSeconds, currentHour);
  const data = series.status === 'ready' ? series.data : null;

  const timeline = useMemo<TimelineDay[]>(
    () => (data ? buildTimeline(data.hours, data.utcOffsetSeconds) : []),
    [data]
  );

  // Only ever the hour on screen, from the spot on screen: the series is keyed
  // by both, so a slow response can never paint another hour or spot.
  const entry = data?.hours[currentHour] ?? null;
  const forecastData: ForecastPayload | null =
    data && entry
      ? {
          stars: entry.stars,
          swellStars: entry.swellStars ?? entry.stars,
          energyKj: entry.energyKj ?? null,
          breakingHeightM: entry.breakingHeightM ?? null,
          unrated: entry.unrated ?? false,
          safety: entry.safety,
          forecast: entry.forecast,
          tides: data.tidesByDay[entry.forecast.timestamp.slice(0, 10)] ?? [],
          config: data.config,
        }
      : null;

  if (!spot) return null;

  const forecast = forecastData?.forecast ?? null;
  const badge = forecast && forecastData?.config ? windBadge(forecast, forecastData.config) : null;
  const isDangerous = forecastData?.safety.isDangerous ?? false;
  const quality = forecastData ? qualityStyle(forecastData.stars, { isDangerous, unrated: forecastData.unrated }) : null;
  const shownDay = forecast?.timestamp.slice(0, 10) ?? instant.day;
  const bestSlot = data ? bestWindow(data.hours, shownDay) : null;
  const shownDayLabel = dayLabel(instant, spotUtcOffsetSeconds).label;

  /** The last hour the loaded series reaches, or the nominal horizon before it loads. */
  const lastHour = data ? Math.max(0, Math.min(MAX_FORECAST_HOURS, data.hours.length - 1)) : MAX_FORECAST_HOURS;

  /**
   * Jumps to another day, keeping the hour of day where that hour exists.
   *
   * Comparing a spot across days is only meaningful at the same hour, but the
   * hours before today's anchor are in the past and the horizon ends mid-day at
   * the far end. Rather than wrap around -- which sent "Today" at 02:00 to
   * *tomorrow* at 02:00, with no tab matching what was shown -- the offset is
   * clamped to the requested day.
   */
  const goToDay = (day: { day: string; startHour: number }) => {
    const first = instantAt(spotUtcOffsetSeconds, day.startHour);
    const wanted = day.startHour + (instant.hour - first.hour);
    const lastOfDay = day.startHour + (23 - first.hour);
    const clamped = Math.max(day.startHour, Math.min(wanted, lastOfDay, lastHour));
    setCurrentHour(clamped);
  };

  const stepHour = (delta: number) => setCurrentHour(Math.min(lastHour, Math.max(0, currentHour + delta)));

  const scoreTone =
    quality?.tier === 'epic'
      ? 'bg-epic text-epic-ink'
      : quality?.tier === 'good'
        ? 'bg-fair text-fair-ink'
        : quality?.tier === 'danger'
          ? 'bg-alert text-white'
          : quality?.tier === 'unrated' || !quality
            ? 'border border-dashed border-line-strong text-ink-2'
            : 'bg-card border border-line text-ink-1';

  return (
    <Drawer.Root open={!!selectedSpotId} onOpenChange={open => !open && setSelectedSpot(null)}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          data-testid="spot-drawer"
          className="bg-sheet text-ink-0 flex flex-col rounded-t-3xl fixed bottom-0 left-0 right-0 z-50 max-h-[92dvh] border-t border-line outline-none max-w-lg mx-auto"
        >
          <div className="mx-auto w-9 h-1 rounded-full bg-zinc-700 mt-2 shrink-0" />

          {/* Header: name, score and the verdict, above the scroll area. */}
          <div className="px-5 pt-3.5 shrink-0">
            <div className="flex items-start gap-3.5">
              <div className="flex-1 min-w-0">
                <Drawer.Title asChild>
                  <h2 className="text-[22px] font-semibold leading-tight tracking-tight truncate">{spot.name}</h2>
                </Drawer.Title>
                <Drawer.Description className="text-[14px] text-ink-2 mt-1 truncate">
                  {spot.community} · {spot.type}
                </Drawer.Description>
              </div>

              <div
                className={`shrink-0 w-16 h-16 rounded-[18px] flex flex-col items-center justify-center ${scoreTone}`}
                data-testid="spot-quality"
              >
                <span className="text-[28px] font-bold leading-none tabular-nums" data-testid="spot-score">
                  {forecastData && !forecastData.unrated ? forecastData.stars : NO_DATA}
                </span>
                <span className="text-[12px] font-semibold mt-1 leading-none" data-testid="spot-tier">
                  {quality ? (quality.tier === 'danger' ? 'Too big' : quality.label) : 'of 10'}
                </span>
              </div>
            </div>

            {forecastData && (
              <p className="mt-3 text-[15px] leading-snug text-ink-1" data-testid="spot-verdict">
                {verdict(forecastData, forecastData.config)}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-2">
              {bestSlot && (
                <span data-testid="best-window">
                  Best {shownDayLabel === 'Today' ? 'today' : shownDayLabel} {bestSlot.label}
                  <span className="text-ink-3"> · {bestSlot.stars}</span>
                </span>
              )}
              {/* The faded-stars idea from Magicseaweed and surf-forecast: say what
                  the swell alone would score, so a low number caused by wind is
                  not mistaken for no swell. */}
              {forecastData && !forecastData.unrated && forecastData.swellStars > forecastData.stars && (
                <span data-testid="spot-potential">
                  Swell alone {forecastData.swellStars}/10 · wind costs {forecastData.swellStars - forecastData.stars}
                </span>
              )}
            </div>
          </div>

          {/* Hour stepper and the week at a glance, browsable in place. */}
          <div className="px-5 pt-2 pb-3 shrink-0 border-b border-line">
            <div className="flex items-center justify-between">
              <button
                onClick={() => stepHour(-1)}
                disabled={currentHour === 0}
                aria-label="Previous hour"
                data-testid="hour-prev"
                className="w-11 h-11 -ml-3 rounded-full flex items-center justify-center text-ink-1 hover:text-white disabled:opacity-25 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="flex items-baseline gap-1.5 text-[15px] font-semibold tabular-nums">
                <span className="text-ink-2 font-medium" data-testid="drawer-day-label">
                  {shownDayLabel}
                </span>
                <span data-testid="drawer-time">{String(instant.hour).padStart(2, '0')}:00</span>
              </span>
              <button
                onClick={() => stepHour(1)}
                disabled={currentHour >= lastHour}
                aria-label="Next hour"
                data-testid="hour-next"
                className="w-11 h-11 -mr-3 rounded-full flex items-center justify-center text-ink-1 hover:text-white disabled:opacity-25 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {series.status === 'ready' ? (
              <ForecastTimeline
                days={timeline}
                currentHour={currentHour}
                activeDay={instant.day}
                onSelectHour={setCurrentHour}
                onSelectDay={goToDay}
              />
            ) : series.status === 'error' ? (
              <div
                className="flex items-center justify-between gap-3 rounded-2xl bg-card border border-line px-3.5 py-3"
                data-testid="forecast-error"
                role="alert"
              >
                <p className="text-[14px] leading-snug text-ink-0 font-medium">
                  Couldn&apos;t load this forecast
                  <span className="block text-[13px] text-ink-2 font-normal">The data provider is busy.</span>
                </p>
                <button
                  onClick={series.retry}
                  data-testid="forecast-retry"
                  className="shrink-0 h-11 flex items-center gap-1.5 rounded-2xl bg-ink-0 text-ground px-4 text-[14px] font-semibold active:scale-[0.98]"
                >
                  <RotateCw size={14} />
                  Try again
                </button>
              </div>
            ) : (
              <div data-testid="forecast-loading" aria-live="polite">
                {series.status === 'loading' && series.retrying ? (
                  <p className="text-[13px] text-ink-2 mb-2" data-testid="forecast-retrying">
                    The data provider is busy. Still trying…
                  </p>
                ) : (
                  <span className="sr-only">Loading forecast</span>
                )}
                <ForecastTimelineSkeleton />
              </div>
            )}
          </div>

          {/* Only this region scrolls, so the header and the action stay put. */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 min-h-0 flex flex-col gap-2">
            {isDangerous && (
              <div
                data-testid="danger-alert"
                role="alert"
                className="bg-alert/10 border border-alert/40 text-red-100 p-3.5 rounded-2xl flex gap-3 items-start mb-1"
              >
                <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-400" />
                <div className="text-[14px] leading-snug">
                  <span className="font-semibold block mb-0.5 text-red-200">Above your level</span>
                  {forecastData?.safety.reason}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <MetricCard
                label="Swell"
                value={forecast ? metres(forecast.swellHeight).replace('m', ' m') : NO_DATA}
                color={forecast?.swellHeight != null ? swellColor(forecast.swellHeight) : undefined}
                testId="swell-height"
                aside={
                  forecast && (
                    <span className="flex items-center gap-1 text-ink-1">
                      <DirectionArrow fromDegrees={forecast.swellDirection} size={11} />
                      <span data-testid="swell-direction">{compassPoint(forecast.swellDirection) ?? NO_DATA}</span>
                    </span>
                  )
                }
              >
                {forecast?.secondarySwellHeight != null && (
                  <span className="text-[12px] text-ink-2 tabular-nums">
                    + {forecast.secondarySwellHeight.toFixed(1)} m
                  </span>
                )}
              </MetricCard>
              <MetricCard label="Period" value={forecast ? seconds(forecast.swellPeriod).replace('s', ' s') : NO_DATA}>
                {forecast && periodClass(forecast.swellPeriod) && (
                  <span className="text-[12px] text-ink-1 capitalize">{periodClass(forecast.swellPeriod)}</span>
                )}
              </MetricCard>
              <MetricCard
                label="Wind"
                value={
                  forecast ? (forecast.windSpeed === null ? 'No data' : `${Math.round(forecast.windSpeed)} km/h`) : NO_DATA
                }
                testId="wind-reading"
                aside={
                  forecast &&
                  forecast.windSpeed !== null && (
                    <span className="flex items-center gap-1 text-ink-1">
                      <DirectionArrow fromDegrees={forecast.windDirection} size={11} />
                      <span data-testid="wind-direction">{compassPoint(forecast.windDirection) ?? ''}</span>
                    </span>
                  )
                }
              >
                {badge && (
                  <span
                    data-testid="wind-badge"
                    className="inline-flex items-center h-5 px-1.5 rounded-md text-[12px] font-medium"
                    style={{ backgroundColor: badge.background, color: badge.foreground }}
                  >
                    {badge.label === 'Cross-shore' ? badge.label : badge.label.replace('-', '')}
                  </span>
                )}
              </MetricCard>
            </div>

            {data ? (
              <TideCard
                hours={data.hours}
                day={shownDay}
                currentKey={forecast?.timestamp ?? instant.key}
                tides={forecastData?.tides ?? []}
              />
            ) : (
              <section className="rounded-2xl bg-card px-3.5 py-3" data-testid="tides-section" aria-label="Tides">
                <h3 className="text-[12px] text-ink-2 font-normal">Tide</h3>
                <p className="text-[14px] text-ink-2 py-2">{series.status === 'error' ? 'No data' : NO_DATA}</p>
              </section>
            )}

            <div className="rounded-2xl border border-line">
              <button
                type="button"
                onClick={() => setDetailsOpen(o => !o)}
                aria-expanded={detailsOpen}
                aria-controls="sea-state-details"
                data-testid="sea-state-toggle"
                className="w-full h-11 flex items-center justify-between px-3.5 text-[14px] text-ink-0"
              >
                Sea state details
                <span className="flex items-center gap-1.5 text-[13px] text-ink-2 tabular-nums">
                  {forecastData?.energyKj != null && `Energy ${forecastData.energyKj.toLocaleString('en-GB')} kJ`}
                  <ChevronDown size={16} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              <dl id="sea-state-details" hidden={!detailsOpen} className="px-3.5 pb-1 border-t border-line">
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
                  <DetailRow key={row.key} term={row.term} testId={row.key}>
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
                  </DetailRow>
                ))}
                <DetailRow term="Wave energy" testId="energy">
                  {forecastData?.energyKj == null ? NO_DATA : `${forecastData.energyKj.toLocaleString('en-GB')} kJ`}
                </DetailRow>
                <DetailRow term="Breaking height" testId="breaking-height">
                  {forecastData?.breakingHeightM == null ? NO_DATA : `~${forecastData.breakingHeightM.toFixed(1)}m`}
                </DetailRow>
                <DetailRow term="Sea level">{forecast ? metres(forecast.seaLevel, 2) : NO_DATA}</DetailRow>
              </dl>
            </div>
          </div>

          {/* Pinned: the action was previously below the fold and unreachable. */}
          <div
            className="shrink-0 px-5 pt-3 border-t border-line bg-sheet"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${spot.coordinates.lat},${spot.coordinates.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="go-to-spot"
              className="w-full h-13 bg-ink-0 text-ground rounded-2xl font-semibold text-[16px] flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <Navigation size={17} />
              Directions
            </a>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
