import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { getMarineHorizonBatch, BATCH_SIZE } from '../../src/services/marine-api';
import { spotsOfRegion } from '../../src/services/spot-catalogue';
import { basinOf, type Basin } from '../../src/services/basins';
import { calculateStarRating, type SpotConfig } from '../../src/services/star-engine';
import { windBadge } from '../../src/services/conditions';

/**
 * spec: surf-rating / Entradas casi iguales dan notas casi iguales.
 *
 * Rates every spot of five regions over the whole horizon with today's real
 * forecast and checks what a surfer notices: two consecutive hours that look
 * the same on screen must not be three stars apart, and a Glass or Light badge
 * must never sit on an hour that loses points to the wind. Before the
 * rating-trust change the first figure was 1.6 % and the second 29-34 %.
 *
 * Depends on the network and on the day's forecast, so it is opt-in:
 * `npm run test:measure`.
 */
const REGIONS = ['País Vasco', 'Cantabria', 'Nouvelle-Aquitaine', 'Cornwall', 'Cataluña'];
const CACHE = '.cache/rating-trust';
/** Open-Meteo's free tier limits calls per minute; wait between live chunks. */
const PAUSE_MS = 20_000;

interface Hour {
  stars: number;
  swellStars: number;
  basin: Basin;
  shownHeightDm: number | null;
  shownPeriodS: number | null;
  shownWindKmh: number | null;
  calmBadge: boolean;
}

function cachedFetch(realFetch: typeof fetch) {
  mkdirSync(CACHE, { recursive: true });
  let live = 0;
  const wrapped = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const file = `${CACHE}/${createHash('md5').update(url).digest('hex')}.json`;
    if (existsSync(file)) return new Response(readFileSync(file, 'utf8'), { status: 200 });
    live++;
    const res = await realFetch(url);
    const body = await res.text();
    if (res.ok) writeFileSync(file, body);
    return new Response(body, { status: res.status });
  }) as typeof fetch;
  return { wrapped, liveCalls: () => live };
}

/** Same on screen: height to 0.1 m, the rounded period, wind within 3 km/h. */
function looksTheSame(a: Hour, b: Hour): boolean {
  if (a.shownPeriodS !== b.shownPeriodS) return false;
  if (a.shownHeightDm === null || b.shownHeightDm === null || Math.abs(a.shownHeightDm - b.shownHeightDm) > 1) return false;
  if (a.shownWindKmh === null || b.shownWindKmh === null) return a.shownWindKmh === b.shownWindKmh;
  return Math.abs(a.shownWindKmh - b.shownWindKmh) <= 3;
}

test('rating stability and wind coherence over five regions', async ({}, testInfo) => {
  test.setTimeout(15 * 60_000);
  const realFetch = globalThis.fetch;
  const { wrapped, liveCalls } = cachedFetch(realFetch);
  globalThis.fetch = wrapped;

  const series: Hour[][] = [];
  try {
    for (const region of REGIONS) {
      const spots = spotsOfRegion(region);
      for (let c = 0; c * BATCH_SIZE < spots.length; c++) {
        const members = spots.slice(c * BATCH_SIZE, (c + 1) * BATCH_SIZE);
        const before = liveCalls();
        const batch = await getMarineHorizonBatch(members.map(s => s.coordinates));
        members.forEach((spot, i) => {
          const hours = batch.series[i];
          if (!hours) return;
          const config = spot.config as SpotConfig;
          const basin = basinOf(spot.coordinates.lat, spot.coordinates.lon);
          series.push(
            hours.flatMap(f => {
              if (!f) return [];
              const r = calculateStarRating(f, config, 'intermediate', spot.name, basin);
              if (r.unrated) return [];
              const label = windBadge(f, config)?.label;
              return [{
                stars: r.stars,
                swellStars: r.swellStars,
                basin,
                shownHeightDm: f.swellHeight === null ? null : Math.round(f.swellHeight * 10),
                shownPeriodS: f.swellPeriod === null ? null : Math.round(f.swellPeriod),
                shownWindKmh: f.windSpeed === null ? null : Math.round(f.windSpeed),
                calmBadge: label === 'Glass' || label === 'Light',
              }];
            })
          );
        });
        if (liveCalls() > before) await new Promise(r => setTimeout(r, PAUSE_MS));
      }
    }
  } finally {
    globalThis.fetch = realFetch;
  }

  const hours = series.flat();
  let pairs = 0;
  let jumps = 0;
  for (const spot of series) {
    for (let h = 0; h + 1 < spot.length; h++) {
      if (!looksTheSame(spot[h], spot[h + 1])) continue;
      pairs++;
      if (Math.abs(spot[h].stars - spot[h + 1].stars) >= 3) jumps++;
    }
  }
  const calm = hours.filter(h => h.calmBadge);
  const calmPenalised = calm.filter(h => h.stars < h.swellStars).length;

  const histogram = (basin: Basin) => {
    const inBasin = hours.filter(h => h.basin === basin);
    return Array.from({ length: 11 }, (_, s) =>
      `${s}:${inBasin.length ? Math.round((100 * inBasin.filter(h => h.stars === s).length) / inBasin.length) : 0}%`
    ).join(' ');
  };
  const atlantic = hours.filter(h => h.basin === 'atlantic');
  const mean = atlantic.reduce((sum, h) => sum + h.stars, 0) / Math.max(1, atlantic.length);
  const report = [
    `spots ${series.length} · rated hours ${hours.length} · live upstream calls ${liveCalls()}`,
    `jumps >= 3 between look-alike hours: ${((100 * jumps) / Math.max(1, pairs)).toFixed(2)} % (${jumps}/${pairs})`,
    `Glass/Light hours losing points to wind: ${calm.length ? ((100 * calmPenalised) / calm.length).toFixed(1) : '0.0'} % (${calmPenalised}/${calm.length})`,
    `atlantic mean ${mean.toFixed(2)} · epic (>=6) ${((100 * atlantic.filter(h => h.stars >= 6).length) / Math.max(1, atlantic.length)).toFixed(0)} %`,
    `atlantic      ${histogram('atlantic')}`,
    `mediterranean ${histogram('mediterranean')}`,
  ].join('\n');
  console.log(report);
  await testInfo.attach('rating-stability.txt', { body: report, contentType: 'text/plain' });

  expect(pairs).toBeGreaterThan(1000);
  expect(jumps / pairs).toBeLessThanOrEqual(0.001);
  expect(calmPenalised).toBe(0);
});
