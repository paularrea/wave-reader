import { NextResponse } from 'next/server';
import spots from '@/data/spots.json';
import { getMarineForecastBatch, BATCH_SIZE } from '@/services/marine-api';
import { calculateStarRating, SkillLevel, SpotConfig } from '@/services/star-engine';
import { basinOf } from '@/services/basins';
import { regionOrder } from '@/services/spot-batches';

const VALID_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'expert'];

export interface BatchRating {
  id: string;
  hasData: boolean;
  stars: number;
  swellStars: number;
  unrated: boolean;
  isDangerous: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region');
  const chunk = Number.parseInt(searchParams.get('chunk') ?? '', 10);
  const hour = Number.parseInt(searchParams.get('hour') ?? '0', 10);
  const levelParam = searchParams.get('level') as SkillLevel | null;
  const level: SkillLevel = levelParam && VALID_LEVELS.includes(levelParam) ? levelParam : 'intermediate';

  if (!region || !Number.isInteger(chunk) || chunk < 0 || !Number.isFinite(hour)) {
    return NextResponse.json({ error: 'region, chunk and hour are required' }, { status: 400 });
  }

  const members = regionOrder(spots, region).slice(chunk * BATCH_SIZE, (chunk + 1) * BATCH_SIZE);
  if (members.length === 0) {
    return NextResponse.json({ region, chunk, results: [] });
  }

  let forecasts;
  try {
    forecasts = await getMarineForecastBatch(
      members.map(s => ({ lat: s.coordinates.lat, lon: s.coordinates.lon })),
      hour
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Batch forecast error for ${region}#${chunk}:`, message);
    return NextResponse.json({ error: `Failed to fetch forecast: ${message}` }, { status: 502 });
  }

  const results: BatchRating[] = members.map((spot, i) => {
    const forecast = forecasts[i];
    if (!forecast) {
      return { id: spot.id, hasData: false, stars: 0, swellStars: 0, unrated: true, isDangerous: false };
    }
    const rating = calculateStarRating(
      forecast,
      spot.config as SpotConfig,
      level,
      spot.name,
      basinOf(spot.coordinates.lat, spot.coordinates.lon)
    );
    return {
      id: spot.id,
      hasData: !rating.unrated,
      stars: rating.stars,
      swellStars: rating.swellStars,
      unrated: rating.unrated,
      isDangerous: rating.safety.isDangerous,
    };
  });

  return NextResponse.json({ region, chunk, results });
}
