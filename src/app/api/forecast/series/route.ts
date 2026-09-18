import { NextResponse } from 'next/server';
import { edgeCacheHeaders } from '@/services/http-cache';
import { getMarineSeries, SpotSeries } from '@/services/marine-api';
import { calculateStarRating, SkillLevel, SpotConfig } from '@/services/star-engine';
import { spotById } from '@/services/spot-catalogue';
import { basinOf } from '@/services/basins';

const VALID_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'expert'];

/**
 * The whole forecast horizon of one spot, rated hour by hour. The detail view
 * loads this once and moves between hours locally: fetching per hour repeated
 * the same upstream call for every step and, on a rate-limit error, left the
 * drawer blank.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const spotId = searchParams.get('spotId');
  const levelParam = searchParams.get('level') as SkillLevel | null;
  const level: SkillLevel = levelParam && VALID_LEVELS.includes(levelParam) ? levelParam : 'intermediate';

  if (!spotId) {
    return NextResponse.json({ error: 'Missing spotId' }, { status: 400 });
  }
  const spot = spotById(spotId);
  if (!spot) {
    return NextResponse.json({ error: 'Spot not found' }, { status: 404 });
  }

  let series: SpotSeries;
  try {
    series = await getMarineSeries(spot.coordinates.lat, spot.coordinates.lon);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Forecast series error for spot ${spotId}:`, message);
    return NextResponse.json({ error: `Failed to fetch forecast: ${message}` }, { status: 502 });
  }

  const config = spot.config as SpotConfig;
  const basin = basinOf(spot.coordinates.lat, spot.coordinates.lon);

  // Index 0 is the next whole hour, so a cached copy is only valid until then.
  return NextResponse.json({
    spot: { id: spot.id, config },
    timezone: series.timezone,
    utcOffsetSeconds: series.utcOffsetSeconds,
    tidesByDay: series.tidesByDay,
    hours: series.hours.map(forecast => ({
      ...calculateStarRating(forecast, config, level, spot.name, basin),
      forecast,
    })),
  }, { headers: edgeCacheHeaders() });
}
