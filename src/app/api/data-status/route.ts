import { NextResponse } from 'next/server';
import { MODELS, toModelStatus, OpenMeteoMeta } from '@/services/data-status';

/** Models update every 1-12 h; ten minutes is fresh enough and spares Open-Meteo. */
const REVALIDATE_SECONDS = 600;

const HOSTS = {
  marine: 'https://marine-api.open-meteo.com',
  weather: 'https://api.open-meteo.com',
} as const;

async function fetchMeta(host: keyof typeof HOSTS, id: string): Promise<OpenMeteoMeta | null> {
  try {
    const res = await fetch(`${HOSTS[host]}/data/${id}/static/meta.json`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    // Open-Meteo answers unknown models with HTTP 200 and an error body.
    return body?.error ? null : body;
  } catch {
    return null;
  }
}

export async function GET() {
  // One failing model must not take the others down with it.
  const models = await Promise.all(
    MODELS.map(async model => toModelStatus(model, await fetchMeta(model.host, model.id)))
  );

  return NextResponse.json({
    generatedAt: Date.now(),
    forecastCacheSeconds: 3600,
    models,
  });
}
