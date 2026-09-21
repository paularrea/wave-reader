/* eslint-disable @typescript-eslint/no-explicit-any -- research script kept as evidence, not product code */
import fs from 'node:fs'; import crypto from 'node:crypto';
import { getMarineHorizonBatch, BATCH_SIZE } from '../../../src/services/marine-api';
import { spotsOfRegion } from '../../../src/services/spot-catalogue';
import { basinOf } from '../../../src/services/basins';
import { calculateStarRating, energyKj, directionFactor, periodFactor, energyScore, windFactor } from '../../../src/services/star-engine';

const CACHE = '.cache/rating-trust'; fs.mkdirSync(CACHE, { recursive: true });
const realFetch = globalThis.fetch;
let live = 0;
globalThis.fetch = (async (url: any, _o: any) => {
  const f = CACHE + '/' + crypto.createHash('md5').update(String(url)).digest('hex') + '.json';
  if (fs.existsSync(f)) return new Response(fs.readFileSync(f, 'utf8'), { status: 200 });
  live++;
  const res = await realFetch(url); const body = await res.text();
  if (res.ok) fs.writeFileSync(f, body);
  return new Response(body, { status: res.status });
}) as any;
// Rule in force when this evidence was taken (removed by the rating-trust change).
const effectiveWindKmh = (m: number | null, g: number | null) => (m === null ? null : g === null ? m : Math.max(m, g / 1.77));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const REGIONS = ['País Vasco', 'Cantabria', 'Nouvelle-Aquitaine', 'Cornwall', 'Cataluña'];
const rows: any[] = [];
for (const region of REGIONS) {
  const spots = spotsOfRegion(region);
  for (let c = 0; c * BATCH_SIZE < spots.length; c++) {
    const members = spots.slice(c * BATCH_SIZE, (c + 1) * BATCH_SIZE);
    const before = live;
    const batch = await getMarineHorizonBatch(members.map(s => s.coordinates));
    members.forEach((spot, i) => {
      const series = batch.series[i]; if (!series) return;
      const basin = basinOf(spot.coordinates.lat, spot.coordinates.lon);
      const cfg: any = spot.config;
      series.forEach((f, h) => {
        if (!f) return;
        const r = calculateStarRating(f, cfg, 'intermediate', spot.name, basin);
        if (r.unrated) return;
        const comps = [[f.swellHeight, f.swellPeriod, f.swellDirection], [f.secondarySwellHeight, f.secondarySwellPeriod, f.secondarySwellDirection], [f.windWaveHeight, f.windWavePeriod, f.windWaveDirection]]
          .filter(([hh, t]) => hh != null && t != null && hh > 0 && t > 0) as number[][];
        const E = comps.map(([hh, t]) => energyKj(hh, t)); const tot = E.reduce((a, b) => a + b, 0);
        const delivered = comps.reduce((s, cc, k) => s + E[k] * directionFactor(cc[2], cfg.swellWindow), 0);
        const wPeriod = comps.reduce((s, cc, k) => s + cc[1] * E[k], 0) / tot;
        const eff = effectiveWindKmh(f.windSpeed, f.windGust ?? null);
        rows.push({ region, id: spot.id, name: spot.name, basin, h, stars: r.stars,
          dispH: f.swellHeight == null ? null : Math.round(f.swellHeight * 10), dispT: f.swellPeriod == null ? null : Math.round(f.swellPeriod),
          dispW: f.windSpeed == null ? null : Math.round(f.windSpeed), wDir: f.windDirection,
          fE: energyScore(delivered, basin), fP: periodFactor(wPeriod, basin), fW: windFactor(eff, f.windDirection, cfg.offshoreWindAngle),
          wPeriod, eff, rawT: f.swellPeriod, rawH: f.swellHeight, mean: f.windSpeed, gust: f.windGust ?? null, off: cfg.offshoreWindAngle, delivered });
      });
    });
    console.error(region, 'chunk', c, members.length, 'spots');
    if (live > before) await sleep(20000);
  }
}
fs.writeFileSync('.cache/rating-trust/rows.json', JSON.stringify(rows));
console.error('rows', rows.length, 'live calls', live);
