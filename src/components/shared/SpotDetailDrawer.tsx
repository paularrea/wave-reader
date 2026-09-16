'use client';

import React from 'react';
import { Drawer } from 'vaul';
import { useStore } from '@/store/useStore';
import spots from '@/data/spots.json';
import { Navigation, Wind, Waves, AlertTriangle, ArrowUp, Clock } from 'lucide-react';
import { MarineForecast } from '@/services/marine-api';
import { TideExtreme } from '@/services/tides';
import { SpotConfig } from '@/services/star-engine';
import {
  qualityColor,
  swellColor,
  windBadge,
  compassPoint,
  formatWind,
  MAX_STARS,
} from '@/services/conditions';

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

const NO_DATA = 'No data';

function metres(value: number | null, digits = 1): string {
  return value === null ? NO_DATA : `${value.toFixed(digits)}m`;
}

function seconds(value: number | null): string {
  return value === null ? NO_DATA : `${Math.round(value)}s`;
}

/** `1.4m @ 12s from NW`, or a single "No data" when the swell is absent. */
function describeSwell(height: number | null, period: number | null, direction: number | null): string {
  if (height === null && period === null && direction === null) return NO_DATA;
  const parts = [metres(height), period === null ? null : `@ ${seconds(period)}`];
  const point = compassPoint(direction);
  if (point) parts.push(`from ${point}`);
  return parts.filter(Boolean).join(' ');
}

function TideRow({ tide }: { tide: TideExtreme }) {
  const isHigh = tide.kind === 'high';
  return (
    <div className="flex items-center justify-between text-sm py-1.5" data-testid={`tide-${tide.kind}`}>
      <span className="flex items-center gap-2">
        <ArrowUp
          size={14}
          className={isHigh ? 'text-blue-300' : 'text-blue-300 rotate-180'}
        />
        <span className="font-medium">{isHigh ? 'High' : 'Low'}</span>
      </span>
      <span className="font-mono text-zinc-300">
        {tide.timestamp.slice(11, 16)}
        <span className="text-zinc-500 ml-2">{tide.heightM.toFixed(2)}m</span>
      </span>
    </div>
  );
}

export function SpotDetailDrawer({ forecastData }: SpotDetailDrawerProps) {
  const { selectedSpotId, setSelectedSpot } = useStore();
  const spot = spots.find(s => s.id === selectedSpotId);

  if (!spot) return null;

  const forecast = forecastData?.forecast ?? null;
  const badge = forecast ? windBadge(forecast, spot.config as SpotConfig) : null;
  const isDangerous = forecastData?.safety.isDangerous ?? false;
  const scoreColor = forecastData
    ? qualityColor(forecastData.stars, { isDangerous, unrated: forecastData.unrated })
    : '#52525B';

  return (
    <Drawer.Root open={!!selectedSpotId} onOpenChange={open => !open && setSelectedSpot(null)}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content
          data-testid="spot-drawer"
          className="bg-zinc-900 text-white flex flex-col rounded-t-[20px] h-auto max-h-[80vh] fixed bottom-0 left-0 right-0 z-50 px-4 pb-8 overflow-y-auto"
        >
          <Drawer.Title className="sr-only">{spot.name}</Drawer.Title>
          <div className="mx-auto w-12 h-1.5 rounded-full bg-zinc-700 my-4" />

          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{spot.name}</h2>
              <p className="text-zinc-400 text-sm">
                {spot.community} • {spot.type}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <div
                className="text-4xl font-black leading-none"
                style={{ color: scoreColor }}
                data-testid="spot-score"
              >
                {forecastData && !forecastData.unrated ? forecastData.stars : '--'}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">
                of {MAX_STARS}
              </span>
            </div>
          </div>

          {isDangerous && (
            <div
              data-testid="danger-alert"
              className="bg-red-500/15 border border-red-500 text-red-200 p-3 rounded-xl flex gap-3 items-start mb-6"
            >
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <span className="font-bold block uppercase mb-1 tracking-wide">
                  Above your level
                </span>
                {forecastData?.safety.reason}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-zinc-800 p-3 rounded-xl flex flex-col items-center justify-center text-center">
              <Waves className="mb-1" size={20} style={{ color: swellColor(forecast?.swellHeight ?? null) }} />
              <span className="text-[10px] text-zinc-500 uppercase font-medium">Swell</span>
              <span
                className="font-bold"
                style={{ color: swellColor(forecast?.swellHeight ?? null) }}
                data-testid="swell-height"
              >
                {forecast ? metres(forecast.swellHeight) : '--'}
              </span>
              <span className="text-[10px] text-zinc-400 mt-0.5" data-testid="swell-direction">
                {forecast ? compassPoint(forecast.swellDirection) ?? NO_DATA : '--'}
              </span>
            </div>

            <div className="bg-zinc-800 p-3 rounded-xl flex flex-col items-center justify-center text-center">
              <Clock className="text-blue-400 mb-1" size={20} />
              <span className="text-[10px] text-zinc-500 uppercase font-medium">Period</span>
              <span className="font-bold">{forecast ? seconds(forecast.swellPeriod) : '--'}</span>
            </div>

            <div className="bg-zinc-800 p-3 rounded-xl flex flex-col items-center justify-center text-center">
              <Wind className="text-zinc-400 mb-1" size={20} />
              <span className="text-[10px] text-zinc-500 uppercase font-medium">Wind</span>
              <span className="font-bold text-sm whitespace-nowrap" data-testid="wind-reading">
                {forecast ? formatWind(forecast.windSpeed, forecast.windDirection) : '--'}
              </span>
              {badge && (
                <span
                  data-testid="wind-badge"
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold mt-1"
                  style={{ backgroundColor: badge.background, color: badge.foreground }}
                >
                  {badge.label}
                </span>
              )}
            </div>
          </div>

          <section className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-4 mb-4" data-testid="tides-section">
            <h3 className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2">
              Tides
            </h3>
            {forecastData && forecastData.tides.length > 0 ? (
              <>
                <div className="divide-y divide-zinc-800">
                  {forecastData.tides.map(tide => (
                    <TideRow key={`${tide.kind}-${tide.timestamp}`} tide={tide} />
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">
                  Derived from hourly sea level — times accurate to about ±30 min.
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">{NO_DATA}</p>
            )}
          </section>

          <section className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-4 mb-6">
            <h3 className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-3">
              Sea state
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-400">Primary swell</dt>
                <dd className="font-medium text-right">
                  {forecast
                    ? describeSwell(forecast.swellHeight, forecast.swellPeriod, forecast.swellDirection)
                    : '--'}
                </dd>
              </div>
              <div className="flex justify-between gap-4" data-testid="secondary-swell">
                <dt className="text-zinc-400">Secondary swell</dt>
                <dd className="font-medium text-right">
                  {forecast
                    ? describeSwell(
                        forecast.secondarySwellHeight,
                        forecast.secondarySwellPeriod,
                        forecast.secondarySwellDirection
                      )
                    : '--'}
                </dd>
              </div>
              <div className="flex justify-between gap-4" data-testid="wind-waves">
                <dt className="text-zinc-400">Wind waves</dt>
                <dd className="font-medium text-right">
                  {forecast
                    ? describeSwell(
                        forecast.windWaveHeight,
                        forecast.windWavePeriod,
                        forecast.windWaveDirection
                      )
                    : '--'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-400">Sea level</dt>
                <dd className="font-medium text-right">
                  {forecast ? metres(forecast.seaLevel, 2) : '--'}
                </dd>
              </div>
            </dl>
          </section>

          <a
            href={`https://www.google.com/maps/search/?api=1&query=${spot.coordinates.lat},${spot.coordinates.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Navigation size={20} />
            Go to Spot
          </a>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
