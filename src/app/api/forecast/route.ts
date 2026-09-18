import { NextResponse } from 'next/server';
import { getMarineForecast, SpotForecast } from '@/services/marine-api';
import { calculateStarRating, SkillLevel, SpotConfig } from '@/services/star-engine';
import { spotById } from '@/services/spot-catalogue';
import { basinOf } from '@/services/basins';

const VALID_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'expert'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const spotId = searchParams.get('spotId');
  const hour = Number.parseInt(searchParams.get('hour') || '0', 10);
  const levelParam = searchParams.get('level') as SkillLevel | null;
  const level: SkillLevel = levelParam && VALID_LEVELS.includes(levelParam) ? levelParam : 'intermediate';

  if (!spotId) {
    return NextResponse.json({ error: 'Missing spotId' }, { status: 400 });
  }
  if (!Number.isFinite(hour)) {
    return NextResponse.json({ error: 'Invalid hour' }, { status: 400 });
  }

  const spot = spotById(spotId);
  if (!spot) {
    return NextResponse.json({ error: 'Spot not found' }, { status: 404 });
  }

  // Caching lives in the service layer, on Next's data cache: it survives cold
  // starts, which a module-level Map does not. The rating is recomputed per
  // request because it depends on the skill level while the upstream payload
  // does not.
  let bundle: SpotForecast;
  try {
    bundle = await getMarineForecast(spot.coordinates.lat, spot.coordinates.lon, hour);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Forecast API error for spot ${spotId}:`, message);
    return NextResponse.json({ error: `Failed to fetch forecast: ${message}` }, { status: 502 });
  }

  const rating = calculateStarRating(
    bundle.forecast,
    spot.config as SpotConfig,
    level,
    spot.name,
    basinOf(spot.coordinates.lat, spot.coordinates.lon)
  );

  return NextResponse.json({
    spot,
    ...rating,
    forecast: bundle.forecast,
    tides: bundle.tides,
    timezone: bundle.timezone,
    utcOffsetSeconds: bundle.utcOffsetSeconds,
  });
}
