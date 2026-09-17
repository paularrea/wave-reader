'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SeriesHour } from '@/services/forecast-series';
import type { SpotConfig } from '@/services/star-engine';
import type { TideExtreme } from '@/services/tides';

export interface SpotSeriesPayload {
  config: SpotConfig | null;
  timezone: string;
  utcOffsetSeconds: number;
  tidesByDay: Record<string, TideExtreme[]>;
  hours: SeriesHour[];
}

export type SeriesState =
  | { status: 'idle' | 'loading'; data: null }
  | { status: 'ready'; data: SpotSeriesPayload }
  | { status: 'error'; data: null };

/** Waits before each retry. A 429 from the upstream quota usually clears within seconds. */
export const RETRY_DELAYS_MS = [1500, 4000, 8000];
/** Matches the server's upstream cache: a reopened spot within this window costs nothing. */
const FRESH_MS = 30 * 60_000;

const cache = new Map<string, { at: number; data: SpotSeriesPayload }>();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSeries(spotId: string, level: string): Promise<SpotSeriesPayload> {
  const res = await fetch(`/api/forecast/series?spotId=${encodeURIComponent(spotId)}&level=${level}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error || !Array.isArray(body.hours)) {
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return {
    config: body.spot?.config ?? null,
    timezone: body.timezone,
    utcOffsetSeconds: body.utcOffsetSeconds,
    tidesByDay: body.tidesByDay ?? {},
    hours: body.hours,
  };
}

/**
 * Loads a spot's whole forecast once, retrying on failure. Before this the
 * detail fetched per hour and dropped any error silently, which is how a
 * rate-limited request left the drawer showing dashes for good.
 */
export function useSpotSeries(spotId: string | null, level: string) {
  const key = spotId ? `${spotId}|${level}` : null;
  const [attempt, setAttempt] = useState(0);
  // Results are stored against the exact request, retry count included, so a
  // new spot, level or retry reads as loading without resetting state here.
  const requestKey = key ? `${key}#${attempt}` : null;
  const [settled, setSettled] = useState<{ requestKey: string; value: SeriesState } | null>(null);

  useEffect(() => {
    if (!key || !spotId || !requestKey) return;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < FRESH_MS) return;

    let cancelled = false;
    (async () => {
      for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
        try {
          const data = await fetchSeries(spotId, level);
          if (cancelled) return;
          cache.set(key, { at: Date.now(), data });
          setSettled({ requestKey, value: { status: 'ready', data } });
          return;
        } catch (error) {
          if (cancelled) return;
          if (i === RETRY_DELAYS_MS.length) {
            console.error('Could not load the spot forecast:', error);
            setSettled({ requestKey, value: { status: 'error', data: null } });
            return;
          }
          await sleep(RETRY_DELAYS_MS[i]);
          if (cancelled) return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, requestKey, spotId, level]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  let value: SeriesState;
  if (!key) value = { status: 'idle', data: null };
  else if (settled?.requestKey === requestKey) value = settled.value;
  else if (cache.has(key)) value = { status: 'ready', data: cache.get(key)!.data };
  else value = { status: 'loading', data: null };

  return { ...value, retry } as SeriesState & { retry: () => void };
}
