/**
 * The spot detail's one-line summary: what the hour is like, in words a surfer
 * would use, so the numbers below confirm a judgement instead of forming it.
 */

import type { MarineForecast } from './marine-api';
import { qualityStyle, windBadge, windDirectionClass } from './conditions';
import { CALM_WIND_KMH } from './star-engine';
import type { SeriesHour } from './forecast-series';

interface VerdictInput {
  stars: number;
  swellStars: number;
  unrated: boolean;
  forecast: MarineForecast;
}

/** Below this a sea reads as flat whatever the model's score. */
const FLAT_M = 0.3;

export function periodClass(periodS: number | null): string | null {
  if (periodS === null) return null;
  if (periodS >= 10) return 'groundswell';
  if (periodS >= 7) return 'swell';
  return 'wind swell';
}

function windPhrase(forecast: MarineForecast, config: { offshoreWindAngle: number; windTolerance: number } | null) {
  if (forecast.windSpeed === null) return null;
  const badge = config ? windBadge(forecast, config) : null;
  if (badge?.label === 'Glass') return 'no wind';
  const speed = forecast.windSpeed;
  // "light" is exactly the range the rating does not charge for, so the phrase
  // never calls a wind light while the score loses points to it.
  const strength = speed < CALM_WIND_KMH ? 'light' : speed < 25 ? 'moderate' : 'strong';
  const direction = config ? windDirectionClass(forecast.windDirection, config) : null;
  return direction ? `${strength} ${direction} wind` : `${strength} wind`;
}

export function verdict(
  input: VerdictInput,
  config: { offshoreWindAngle: number; windTolerance: number } | null
): string {
  const { forecast } = input;
  if (input.unrated || forecast.swellHeight === null) return 'No wave data for this hour.';

  const height = forecast.swellHeight;
  const kind = periodClass(forecast.swellPeriod) ?? 'swell';
  const wind = windPhrase(forecast, config);

  // The tier's own name, so the score box and this line never call one level
  // two things. Flat and Blown out are the two kinds of Poor worth naming.
  let quality: string;
  if (height < FLAT_M) quality = 'Flat';
  else if (input.stars >= 1) quality = qualityStyle(input.stars).label;
  else if (input.swellStars > input.stars) quality = 'Blown out';
  else quality = 'Poor';

  const period = forecast.swellPeriod === null ? '' : ` at ${Math.round(forecast.swellPeriod)} s`;
  const size = `${height.toFixed(1)} m ${kind}${period}`;
  return wind ? `${quality}: ${size}, ${wind}.` : `${quality}: ${size}.`;
}

export interface BestWindow {
  /** Hour offsets, inclusive start and exclusive end. */
  from: number;
  to: number;
  stars: number;
  /** `09:00–12:00`, local. */
  label: string;
}

/**
 * The first stretch of the day's best score, when that score is worth going
 * for. `hours` is the loaded series; `day` a local `YYYY-MM-DD`.
 */
export function bestWindow(hours: SeriesHour[], day: string): BestWindow | null {
  const inDay = hours
    .map((h, offset) => ({ h, offset }))
    .filter(({ h }) => h.forecast.timestamp.startsWith(day) && !h.unrated);
  if (inDay.length === 0) return null;

  const top = Math.max(...inDay.map(({ h }) => h.stars));
  if (top < 1) return null;

  const firstIndex = inDay.findIndex(({ h }) => h.stars === top);
  let lastIndex = firstIndex;
  while (
    lastIndex + 1 < inDay.length &&
    inDay[lastIndex + 1].h.stars === top &&
    inDay[lastIndex + 1].offset === inDay[lastIndex].offset + 1
  ) {
    lastIndex++;
  }

  const startHour = Number.parseInt(inDay[firstIndex].h.forecast.timestamp.slice(11, 13), 10);
  const endHour = Number.parseInt(inDay[lastIndex].h.forecast.timestamp.slice(11, 13), 10) + 1;
  const pad = (n: number) => String(n % 24).padStart(2, '0');
  const label = endHour - startHour <= 1 ? `${pad(startHour)}:00` : `${pad(startHour)}:00–${pad(endHour)}:00`;

  return { from: inDay[firstIndex].offset, to: inDay[lastIndex].offset + 1, stars: top, label };
}
