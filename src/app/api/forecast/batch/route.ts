import { NextResponse } from 'next/server';
import { edgeCacheHeaders } from '@/services/http-cache';
import { allSpots } from '@/services/spot-catalogue';
import { getMarineHorizonBatch, BATCH_SIZE } from '@/services/marine-api';
import { calculateStarRating, SkillLevel, SpotConfig } from '@/services/star-engine';
import { basinOf } from '@/services/basins';
import { regionOrder } from '@/services/spot-batches';

const VALID_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'expert'];

/**
 * One spot's horizon, compact: parallel arrays indexed by hours after `start`.
 * `stars` is -1 where the hour is unrated; `height` is in decimetres.
 */
export interface BatchHorizon {
  id: string;
  hasData: boolean;
  stars: number[];
  swellStars: number[];
  height: number[];
  period: number[];
  /** Hour indices where the level's safety alert fires. */
  danger: number[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region');
  const chunk = Number.parseInt(searchParams.get('chunk') ?? '', 10);
  const levelParam = searchParams.get('level') as SkillLevel | null;
  const level: SkillLevel = levelParam && VALID_LEVELS.includes(levelParam) ? levelParam : 'intermediate';

  if (!region || !Number.isInteger(chunk) || chunk < 0) {
    return NextResponse.json({ error: 'region and chunk are required' }, { status: 400 });
  }

  const members = regionOrder(allSpots(), region).slice(chunk * BATCH_SIZE, (chunk + 1) * BATCH_SIZE);

  let batch;
  try {
    batch = await getMarineHorizonBatch(members.map(s => ({ lat: s.coordinates.lat, lon: s.coordinates.lon })));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Batch forecast error for ${region}#${chunk}:`, message);
    return NextResponse.json({ error: `Failed to fetch forecast: ${message}` }, { status: 502 });
  }

  const results: BatchHorizon[] = members.map((spot, i) => {
    const hours = batch.series[i];
    const empty = { id: spot.id, hasData: false, stars: [], swellStars: [], height: [], period: [], danger: [] };
    if (!hours) return empty;

    const config = spot.config as SpotConfig;
    const basin = basinOf(spot.coordinates.lat, spot.coordinates.lon);
    const out: BatchHorizon = { ...empty, hasData: false };
    hours.forEach((forecast, h) => {
      if (!forecast) {
        out.stars.push(-1);
        out.swellStars.push(-1);
        out.height.push(-1);
        out.period.push(-1);
        return;
      }
      const rating = calculateStarRating(forecast, config, level, spot.name, basin);
      if (!rating.unrated) out.hasData = true;
      out.stars.push(rating.unrated ? -1 : rating.stars);
      out.swellStars.push(rating.unrated ? -1 : rating.swellStars);
      out.height.push(forecast.swellHeight === null ? -1 : Math.round(forecast.swellHeight * 10));
      out.period.push(forecast.swellPeriod === null ? -1 : Math.round(forecast.swellPeriod));
      if (rating.safety.isDangerous) out.danger.push(h);
    });
    return out;
  });

  // Hours are looked up by absolute time, so a cached batch stays correct for a while.
  return NextResponse.json({ region, chunk, start: batch.start, results }, { headers: edgeCacheHeaders(1800) });
}
