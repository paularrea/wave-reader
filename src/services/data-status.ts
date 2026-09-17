/**
 * Where the forecast comes from and how fresh it is.
 *
 * Open-Meteo publishes per-model metadata at /data/{model}/static/meta.json:
 * when the last run was initialised, when it became available, and how often
 * the model runs. The info panel shows those real times rather than guessing.
 *
 * Open-Meteo's "best match" picks the highest-resolution model available for
 * each point and does not say which one served a given spot, so the panel lists
 * the candidate models for our coasts rather than claiming a single source.
 */

export type ModelRole = 'waves' | 'wind';

export interface ModelInfo {
  id: string;
  host: 'marine' | 'weather';
  role: ModelRole;
  name: string;
  provider: string;
  resolution: string;
  coverage: string;
}

/** Resolutions and coverage from Open-Meteo's API documentation. */
export const MODELS: ModelInfo[] = [
  { id: 'ecmwf_wam', host: 'marine', role: 'waves', name: 'ECMWF WAM', provider: 'ECMWF', resolution: '9 km', coverage: 'Global' },
  { id: 'meteofrance_wave', host: 'marine', role: 'waves', name: 'MFWAM', provider: 'Météo-France', resolution: '8 km', coverage: 'Global' },
  { id: 'dwd_ewam', host: 'marine', role: 'waves', name: 'EWAM', provider: 'DWD', resolution: '5 km', coverage: 'Europe' },
  { id: 'ncep_gfswave025', host: 'marine', role: 'waves', name: 'GFS Wave', provider: 'NOAA NCEP', resolution: '25 km', coverage: 'Global' },
  { id: 'meteofrance_arome_france_hd', host: 'weather', role: 'wind', name: 'AROME HD', provider: 'Météo-France', resolution: '1.5 km', coverage: 'France and surroundings' },
  { id: 'dwd_icon', host: 'weather', role: 'wind', name: 'ICON', provider: 'DWD', resolution: '11 km', coverage: 'Global' },
  { id: 'ecmwf_ifs025', host: 'weather', role: 'wind', name: 'IFS', provider: 'ECMWF', resolution: '25 km', coverage: 'Global' },
];

export interface ModelStatus extends ModelInfo {
  status: 'ok' | 'unavailable';
  /** Epoch ms. */
  lastRunInitialisedAt: number | null;
  lastRunAvailableAt: number | null;
  updateIntervalSeconds: number | null;
  nextExpectedAt: number | null;
}

export interface OpenMeteoMeta {
  last_run_initialisation_time?: number;
  last_run_availability_time?: number;
  update_interval_seconds?: number;
}

/**
 * Next run is expected one interval after the last one became available: the
 * lag between initialisation and availability is stable run to run. Presented
 * as "expected", never as a promise.
 */
export function toModelStatus(model: ModelInfo, meta: OpenMeteoMeta | null): ModelStatus {
  const available = meta?.last_run_availability_time;
  const interval = meta?.update_interval_seconds;

  if (!meta || typeof available !== 'number' || typeof interval !== 'number') {
    return {
      ...model,
      status: 'unavailable',
      lastRunInitialisedAt: null,
      lastRunAvailableAt: null,
      updateIntervalSeconds: null,
      nextExpectedAt: null,
    };
  }

  return {
    ...model,
    status: 'ok',
    lastRunInitialisedAt:
      typeof meta.last_run_initialisation_time === 'number' ? meta.last_run_initialisation_time * 1000 : null,
    lastRunAvailableAt: available * 1000,
    updateIntervalSeconds: interval,
    nextExpectedAt: (available + interval) * 1000,
  };
}

function compact(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "in 2h 5m", or "due now" once the expected time has passed. */
export function describeNextUpdate(nextExpectedAt: number | null, now: number): string {
  if (nextExpectedAt === null) return 'Unavailable';
  const remaining = nextExpectedAt - now;
  if (remaining <= 60_000) return 'Due now';
  return `in ${compact(remaining)}`;
}

/** "3h 12m ago". */
export function describeAgo(at: number | null, now: number): string {
  if (at === null) return 'Unavailable';
  return `${compact(now - at)} ago`;
}

/** "Every 6h". */
export function describeInterval(seconds: number | null): string {
  if (seconds === null) return 'Unknown';
  return `Every ${compact(seconds * 1000)}`;
}
