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

export interface SpotSeries {
  /** Every hour of the horizon from the anchor, in the spot's local time. */
  hours: MarineForecast[];
  timezone: string;
  utcOffsetSeconds: number;
  /** Tide extremes keyed by local day, `YYYY-MM-DD`. */
  tidesByDay: Record<string, TideExtreme[]>;
}

/**
 * The whole horizon for one spot in two upstream calls. Open-Meteo returns
 * seven days per request anyway; asking again for every hour the user steps
 * through only multiplied calls against a rate-limited account.
 */
export async function getMarineSeries(lat: number, lon: number): Promise<SpotSeries> {
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
  const weatherHourly = weather?.hourly;

  const now = new Date();
  const hours: MarineForecast[] = [];
  for (let offset = 0; offset <= MAX_FORECAST_HOURS; offset++) {
    const target = instantAt(utcOffsetSeconds, offset, now);
    const mi = marineHourly.time.indexOf(target.key);
    if (mi === -1) break;

    // Join the two hosts by timestamp, never by array position: if one of them
    // trims its horizon the offsets diverge and every reading silently shifts.
    const wi: number = weatherHourly?.time?.indexOf(target.key) ?? -1;

    hours.push({
      timestamp: target.key,
      // `swell_wave_*` is the swell proper; `wave_*` is the combined sea. Prefer
      // the former and fall back so a spot is never left blank.
      swellHeight: at(marineHourly.swell_wave_height, mi) ?? at(marineHourly.wave_height, mi),
      swellPeriod: at(marineHourly.swell_wave_period, mi) ?? at(marineHourly.wave_period, mi),
      swellDirection: at(marineHourly.swell_wave_direction, mi) ?? at(marineHourly.wave_direction, mi),
      secondarySwellHeight: at(marineHourly.secondary_swell_wave_height, mi),
      secondarySwellPeriod: at(marineHourly.secondary_swell_wave_period, mi),
      secondarySwellDirection: at(marineHourly.secondary_swell_wave_direction, mi),
      windWaveHeight: at(marineHourly.wind_wave_height, mi),
      windWavePeriod: at(marineHourly.wind_wave_period, mi),
      windWaveDirection: at(marineHourly.wind_wave_direction, mi),
      windSpeed: wi === -1 ? null : at(weatherHourly?.wind_speed_10m, wi),
      windDirection: wi === -1 ? null : at(weatherHourly?.wind_direction_10m, wi),
      windGust: wi === -1 ? null : at(weatherHourly?.wind_gusts_10m, wi),
      seaLevel: at(marineHourly.sea_level_height_msl, mi),
    });
  }

  const seaLevelSeries = marineHourly.sea_level_height_msl;
  const series: TideSeries = {
    time: marineHourly.time,
    seaLevel: Array.isArray(seaLevelSeries) ? (seaLevelSeries as (number | null)[]) : [],
  };
  const tidesByDay: Record<string, TideExtreme[]> = {};
  for (const hour of hours) {
    const day = hour.timestamp.slice(0, 10);
    if (!(day in tidesByDay)) tidesByDay[day] = tidesForDay(series, day);
  }

  return { hours, timezone, utcOffsetSeconds, tidesByDay };
}

export async function getMarineForecast(
  lat: number,
  lon: number,
  hourOffset: number
): Promise<SpotForecast> {
  const series = await getMarineSeries(lat, lon);
  const forecast = series.hours[hourOffset];
  if (!forecast) {
    const target = instantAt(series.utcOffsetSeconds, hourOffset);
    throw new Error(`No marine data for ${target.key} (${series.timezone})`);
  }
  return {
    forecast,
    timezone: series.timezone,
    utcOffsetSeconds: series.utcOffsetSeconds,
    tides: series.tidesByDay[forecast.timestamp.slice(0, 10)] ?? [],
  };
}

/** Open-Meteo accepts many coordinates per call; 50 keeps URLs well within limits. */
export const BATCH_SIZE = 50;

/** The absolute UTC hour the timeline's offset points at. */
function targetUtcHour(hourOffset: number, now: Date = new Date()): Date {
  const next = new Date(now);
  // Round up to the next whole hour, as the timeline anchor does. Every offset
  // in the catalogue is a whole number of hours, so the absolute hour matches.
  if (next.getUTCMinutes() !== 0 || next.getUTCSeconds() !== 0 || next.getUTCMilliseconds() !== 0) {
    next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  }
  next.setUTCHours(next.getUTCHours() + hourOffset);
  return next;
}

const isoHour = (d: Date) => d.toISOString().slice(0, 13) + ':00';

/**
 * Rating inputs for up to BATCH_SIZE points at a single hour, in two upstream
 * calls. The map uses this to score a whole viewport: one call per spot left
 * most of a busy region unscored behind a per-viewport cap. Tides are not
 * included -- only the spot detail needs them.
 */
export async function getMarineForecastBatch(
  points: Array<{ lat: number; lon: number }>,
  hourOffset: number
): Promise<Array<MarineForecast | null>> {
  if (points.length === 0) return [];
  if (points.length > BATCH_SIZE) throw new Error(`batch of ${points.length} exceeds ${BATCH_SIZE}`);

  /**
   * Ask for the whole UTC day containing the target hour, not the hour alone.
   * Open-Meteo's free tier rate-limits per minute and a busy region is many
   * chunks: with a day per request, moving the slider within that day costs no
   * upstream call, and the URL is identical for every visitor all day long.
   */
  const target = targetUtcHour(hourOffset);
  const dayStart = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 23 * 3_600_000);
  const hour = isoHour(target);

  const lats = points.map(p => p.lat.toFixed(4)).join(',');
  const lons = points.map(p => p.lon.toFixed(4)).join(',');
  const window = `timezone=GMT&start_hour=${isoHour(dayStart)}&end_hour=${isoHour(dayEnd)}`;

  const [marineRaw, weatherRaw] = await Promise.all([
    getJson(`${MARINE_HOST}?latitude=${lats}&longitude=${lons}&hourly=${MARINE_PARAMS}&${window}`),
    getJson(`${WEATHER_HOST}?latitude=${lats}&longitude=${lons}&hourly=${WEATHER_PARAMS}&${window}`),
  ]);

  // A single coordinate comes back as an object, several as an array.
  const asList = (raw: unknown) => (Array.isArray(raw) ? raw : [raw]) as HourlyResponse[];
  const marine = asList(marineRaw);
  const weather = asList(weatherRaw);

  return points.map((_, i) => {
    const m = marine[i]?.hourly;
    const w = weather[i]?.hourly;
    if (!m?.time?.length) return null;

    // Join by timestamp, never by position, as the single-spot path does.
    const mi = m.time.indexOf(hour);
    if (mi === -1) return null;
    const wi = w?.time?.indexOf(hour) ?? -1;

    const forecast: MarineForecast = {
      timestamp: hour,
      swellHeight: at(m.swell_wave_height, mi) ?? at(m.wave_height, mi),
      swellPeriod: at(m.swell_wave_period, mi) ?? at(m.wave_period, mi),
      swellDirection: at(m.swell_wave_direction, mi) ?? at(m.wave_direction, mi),
      secondarySwellHeight: at(m.secondary_swell_wave_height, mi),
      secondarySwellPeriod: at(m.secondary_swell_wave_period, mi),
      secondarySwellDirection: at(m.secondary_swell_wave_direction, mi),
      windWaveHeight: at(m.wind_wave_height, mi),
      windWavePeriod: at(m.wind_wave_period, mi),
      windWaveDirection: at(m.wind_wave_direction, mi),
      windSpeed: wi === -1 ? null : at(w?.wind_speed_10m, wi),
      windDirection: wi === -1 ? null : at(w?.wind_direction_10m, wi),
      windGust: wi === -1 ? null : at(w?.wind_gusts_10m, wi),
      seaLevel: null,
    };

    // The model has no waves here at all: treat the spot as having no data.
    const anyWave = [forecast.swellHeight, forecast.secondarySwellHeight, forecast.windWaveHeight].some(
      v => v !== null
    );
    return anyWave ? forecast : null;
  });
}
