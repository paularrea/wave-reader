import { NextResponse } from 'next/server';
import { getMarineForecast, SpotForecast } from '@/services/marine-api';
import { calculateStarRating, SkillLevel, SpotConfig } from '@/services/star-engine';
import spots from '@/data/spots.json';

interface CacheEntry {
  data: SpotForecast;
  timestamp: number;
}

const forecastCache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour, matching the forecast's own resolution

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

  const spot = spots.find(s => s.id === spotId);
  if (!spot) {
    return NextResponse.json({ error: 'Spot not found' }, { status: 404 });
  }

  // The upstream payload does not depend on skill level, so the cache is keyed
  // by spot and hour only; the rating is recomputed per request. Keying it by
  // level as well would triple the upstream calls for identical data.
  const cacheKey = `${spotId}-${hour}`;
  const cached = forecastCache.get(cacheKey);

  let bundle: SpotForecast;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    bundle = cached.data;
  } else {
    try {
      bundle = await getMarineForecast(spot.coordinates.lat, spot.coordinates.lon, hour);
      forecastCache.set(cacheKey, { data: bundle, timestamp: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Forecast API error for spot ${spotId}:`, message);
      return NextResponse.json({ error: `Failed to fetch forecast: ${message}` }, { status: 502 });
    }
  }

  const rating = calculateStarRating(
    bundle.forecast,
    spot.config as SpotConfig,
    level,
    spot.name
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
