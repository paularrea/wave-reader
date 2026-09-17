import { TideExtreme, TideSeries, tidesForDay } from './tides';
import { instantAt, MAX_FORECAST_HOURS } from './timeline';

/**
 * Open-Meteo splits what a surf forecast needs across two hosts:
 *   - marine-api.open-meteo.com/v1/marine  -> waves, swell, sea level
 *   - api.open-meteo.com/v1/forecast       -> wind
 *
 * The marine host accepts `wind_speed_10m` as a parameter but answers with a
 * column of nulls (`"wind_speed_10m": "undefined"` in hourly_units). Asking it
 * for wind is the bug this module exists to not repeat.
 */
const MARINE_HOST = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_HOST = 'https://api.open-meteo.com/v1/forecast';

const MARINE_PARAMS = [
  'wave_height',
  'wave_period',
  'wave_direction',
  'swell_wave_height',
  'swell_wave_period',
  'swell_wave_direction',
  'secondary_swell_wave_height',
  'secondary_swell_wave_period',
  'secondary_swell_wave_direction',
  'wind_wave_height',
  'wind_wave_period',
  'wind_wave_direction',
  'sea_level_height_msl',
].join(',');

const WEATHER_PARAMS = ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'].join(',');

/**
 * Every optional magnitude is `number | null`. Nothing between here and the UI
 * may coerce a missing value to 0: `null * 1.852 === 0` in JavaScript is
 * exactly how this app ended up reporting a flat calm at every spot on earth.
 */
export interface MarineForecast {
  /** `YYYY-MM-DDTHH:00` in the spot's local time. */
  timestamp: string;
  swellHeight: number | null;
  swellPeriod: number | null;
  swellDirection: number | null;
  secondarySwellHeight: number | null;
  secondarySwellPeriod: number | null;
  secondarySwellDirection: number | null;
  windWaveHeight: number | null;
  windWavePeriod: number | null;
  windWaveDirection: number | null;
  /** km/h, exactly as Open-Meteo delivers it. No conversion is applied. */
  windSpeed: number | null;
  windDirection: number | null;
  /** km/h, as delivered. Null when the provider has no gust for the hour. */
  windGust?: number | null;
  seaLevel: number | null;
}

export interface SpotForecast {
  forecast: MarineForecast;
  /** IANA zone resolved by Open-Meteo from the spot's coordinates. */
  timezone: string;
  utcOffsetSeconds: number;
  /** Tide extremes for the local day of `forecast.timestamp`. */
  tides: TideExtreme[];
}

function at(series: unknown, index: number): number | null {
  if (!Array.isArray(series)) return null;
  const value = series[index];
  return typeof value === 'number' ? value : null;
}

/** Open-Meteo's hourly block: parallel arrays keyed by column name. */
interface HourlyResponse {
  hourly?: { time?: string[]; [column: string]: unknown };
  utc_offset_seconds?: number;
  timezone?: string;
}

/**
 * Upstream responses are cached by Next's data cache rather than a module-level
 * Map. On Vercel each serverless invocation may be a cold start, so an
 * in-process cache is empty most of the time -- and with a national catalogue
 * that means thousands of upstream calls against an account with per-minute and
 * per-hour caps. The data cache survives invocations and is shared across them.
 */
const UPSTREAM_CACHE_SECONDS = 3600; // matches the forecast's hourly resolution

async function getJson(url: string): Promise<HourlyResponse> {
  const res = await fetch(url, { next: { revalidate: UPSTREAM_CACHE_SECONDS } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${new URL(url).host} responded ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function dateRange(): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now.getTime() + (MAX_FORECAST_HOURS + 24) * 3600_000);
  return {
    start: now.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function getMarineForecast(
  lat: number,
  lon: number,
  hourOffset: number
): Promise<SpotForecast> {
  const { start, end } = dateRange();
  const common = `latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&timezone=auto`;

  // Both hosts are asked for the same window with timezone=auto, so their
  // series are already in the spot's local time.
  const [marine, weather] = await Promise.all([
    getJson(`${MARINE_HOST}?${common}&hourly=${MARINE_PARAMS}`),
    getJson(`${WEATHER_HOST}?${common}&hourly=${WEATHER_PARAMS}`),
  ]);

  const marineHourly = marine?.hourly;
  if (!marineHourly?.time?.length) {
    throw new Error('Marine API returned no hourly series');
  }

  const utcOffsetSeconds: number = marine.utc_offset_seconds ?? 0;
  const timezone: string = marine.timezone ?? 'UTC';

  const target = instantAt(utcOffsetSeconds, hourOffset);
  const marineIndex = marineHourly.time.indexOf(target.key);
  if (marineIndex === -1) {
    throw new Error(`No marine data for ${target.key} (${timezone})`);
  }

  // Join the two hosts by timestamp, never by array position: if one of them
  // trims its horizon the offsets diverge and every reading silently shifts.
  const weatherHourly = weather?.hourly;
  const weatherIndex: number = weatherHourly?.time?.indexOf(target.key) ?? -1;

  const forecast: MarineForecast = {
    timestamp: target.key,
    // `swell_wave_*` is the swell proper; `wave_*` is the combined sea. Prefer
    // the former and fall back so a spot is never left blank.
    swellHeight: at(marineHourly.swell_wave_height, marineIndex) ?? at(marineHourly.wave_height, marineIndex),
    swellPeriod: at(marineHourly.swell_wave_period, marineIndex) ?? at(marineHourly.wave_period, marineIndex),
    swellDirection: at(marineHourly.swell_wave_direction, marineIndex) ?? at(marineHourly.wave_direction, marineIndex),
    secondarySwellHeight: at(marineHourly.secondary_swell_wave_height, marineIndex),
    secondarySwellPeriod: at(marineHourly.secondary_swell_wave_period, marineIndex),
    secondarySwellDirection: at(marineHourly.secondary_swell_wave_direction, marineIndex),
    windWaveHeight: at(marineHourly.wind_wave_height, marineIndex),
    windWavePeriod: at(marineHourly.wind_wave_period, marineIndex),
    windWaveDirection: at(marineHourly.wind_wave_direction, marineIndex),
    windSpeed: weatherIndex === -1 ? null : at(weatherHourly?.wind_speed_10m, weatherIndex),
    windDirection: weatherIndex === -1 ? null : at(weatherHourly?.wind_direction_10m, weatherIndex),
    windGust: weatherIndex === -1 ? null : at(weatherHourly?.wind_gusts_10m, weatherIndex),
    seaLevel: at(marineHourly.sea_level_height_msl, marineIndex),
  };

  const seaLevelSeries = marineHourly.sea_level_height_msl;
  const series: TideSeries = {
    time: marineHourly.time,
    seaLevel: Array.isArray(seaLevelSeries) ? (seaLevelSeries as (number | null)[]) : [],
  };

  return {
    forecast,
    timezone,
    utcOffsetSeconds,
    tides: tidesForDay(series, target.day),
  };
}
