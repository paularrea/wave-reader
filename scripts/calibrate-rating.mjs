#!/usr/bin/env node
/**
 * Refits the surf rating's constants against surf-forecast's published ratings.
 *
 * Neither surf-forecast nor Surfline publishes a rating formula, so matching
 * the scale users know means fitting to their output. This script reimplements
 * star-engine.ts's structure with every constant as a parameter, searches the
 * parameter space, and validates by leaving each spot out of the fit.
 *
 * Input (not versioned, third-party data): .cache/benchmark/
 *   surfforecast-spots.json  { spot: [[slot, rating, swells, kJ, windKmh, windDir, windState], ...] }
 *   surfline-all.json        { zone: [[name, lat, lon, offshoreDir, ratingKey, human, ...], ...] }
 *
 * Collect by reading public forecast pages by hand. Do not automate recurring
 * extraction from those sites; it conflicts with their terms.
 *
 *   node scripts/calibrate-rating.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
const B = new URL('../.cache/benchmark/', import.meta.url);
const sf = JSON.parse(readFileSync(new URL('surfforecast-spots.json', B)));
const sl = JSON.parse(readFileSync(new URL('surfline-all.json', B)));

const E = (h, t) => 1.9 * h * h * t * t;
const REL = { off: 0, 'cross-off': 45, cross: 90, 'cross-on': 135, on: 180, glassy: 0 };

// Normalised samples: components [h,t], wind speed km/h, relative angle (0 = offshore, 180 = onshore)
const SF = [];
for (const [spot, list] of Object.entries(sf)) {
  if (spot.startsWith('__')) continue;
  for (const [, rating, swells, , wkmh, , state] of list) {
    if (!Number.isFinite(rating) || !swells.length) continue;
    SF.push({ spot, y: rating, comps: swells.map(w => [w[0], w[1]]), v: state === 'glassy' ? Math.min(wkmh ?? 0, 5) : (wkmh ?? 0), rel: REL[state] ?? 90 });
  }
}
const SL_ORD = { VERY_POOR: 0, POOR: 1, POOR_TO_FAIR: 2, FAIR: 3, FAIR_TO_GOOD: 4, GOOD: 5, EPIC: 6 };
const SLS = [];
for (const [zone, list] of Object.entries(sl)) for (const r of list) {
  const [, , , offshore, key, human, , , wkts, wdir, , swells] = r;
  if (key == null || human) continue;
  const rel = Math.abs(((wdir - offshore) % 360 + 540) % 360 - 180);
  SLS.push({ zone, y: SL_ORD[key], comps: swells.map(w => [w[0], w[1]]), v: wkts * 1.852, rel });
}

function model(p, s) {
  const es = s.comps.map(([h, t]) => E(h, t));
  const tot = es.reduce((a, b) => a + b, 0);
  if (tot <= 0) return 0;
  const T = s.comps.reduce((a, c, i) => a + c[1] * es[i], 0) / tot;
  let base = tot < p.flat ? 0 : Math.min(10, (10 * Math.log10(tot / p.flat)) / Math.log10(p.top / p.flat));
  base = Math.max(0, base) ** p.gamma * 10 ** (1 - p.gamma);
  const pf = T < 6 ? p.p6 : T < 8 ? p.p8 : T < 10 ? p.p10 : 1;
  const swell = base * pf;
  let wf = 1;
  if (s.v >= p.light) {
    const rad = ((180 - s.rel) * Math.PI) / 180; // rel 180 = onshore -> cos = 1
    const on = s.v * Math.max(0, Math.cos(rad)), cr = s.v * Math.abs(Math.sin(rad));
    wf = 1 - on / p.onB - cr / p.crB;
    if (s.v > 45) wf *= Math.max(0, 1 - (s.v - 45) / 30);
    wf = Math.min(1, Math.max(0, wf));
  }
  return Math.min(Math.round(swell), Math.round(swell * wf));
}

const mae = (p, data) => data.reduce((a, s) => a + Math.abs(model(p, s) - s.y), 0) / data.length;
const within1 = (p, data) => data.filter(s => Math.abs(model(p, s) - s.y) <= 1).length / data.length;
const exact = (p, data) => data.filter(s => model(p, s) === s.y).length / data.length;

const CURRENT = { flat: 50, top: 5000, gamma: 1, p6: 0.5, p8: 0.7, p10: 0.85, light: 8, onB: 35, crB: 90 };
const rnd = (a, b) => a + Math.random() * (b - a);
const lrnd = (a, b) => Math.exp(rnd(Math.log(a), Math.log(b)));

function search(data, iters) {
  let best = CURRENT, bestScore = mae(CURRENT, data);
  for (let i = 0; i < iters; i++) {
    const p = { flat: lrnd(20, 400), top: lrnd(1500, 60000), gamma: rnd(0.6, 1.8), p6: rnd(0.2, 1), p8: rnd(0.4, 1), p10: rnd(0.6, 1), light: rnd(4, 14), onB: rnd(15, 80), crB: rnd(30, 200) };
    if (!(p.p6 <= p.p8 && p.p8 <= p.p10)) continue;
    const sc = mae(p, data);
    if (sc < bestScore) { best = p; bestScore = sc; }
  }
  // local refinement
  for (let i = 0; i < iters / 2; i++) {
    const p = { ...best };
    const k = Object.keys(p)[Math.floor(Math.random() * 9)];
    p[k] *= rnd(0.9, 1.1);
    if (!(p.p6 <= p.p8 && p.p8 <= p.p10 && p.p10 <= 1)) continue;
    const sc = mae(p, data);
    if (sc < bestScore) { best = p; bestScore = sc; }
  }
  return best;
}

const spots = [...new Set(SF.map(s => s.spot))];
console.log('muestras surf-forecast', SF.length, '| spots', spots.length);
console.log('ACTUAL   MAE', mae(CURRENT, SF).toFixed(2), '| exacto', (100 * exact(CURRENT, SF)).toFixed(0) + '%', '| ±1', (100 * within1(CURRENT, SF)).toFixed(0) + '%');

// leave-one-spot-out
let cvErr = 0, cvN = 0, cvW1 = 0, cvEx = 0;
for (const hold of spots) {
  const train = SF.filter(s => s.spot !== hold), test = SF.filter(s => s.spot === hold);
  const p = search(train, 6000);
  cvErr += mae(p, test) * test.length; cvW1 += within1(p, test) * test.length; cvEx += exact(p, test) * test.length; cvN += test.length;
}
console.log('VALIDADO (spot fuera) MAE', (cvErr / cvN).toFixed(2), '| exacto', (100 * cvEx / cvN).toFixed(0) + '%', '| ±1', (100 * cvW1 / cvN).toFixed(0) + '%');

const final = search(SF, 20000);
console.log('AJUSTE FINAL MAE', mae(final, SF).toFixed(2), '| exacto', (100 * exact(final, SF)).toFixed(0) + '%', '| ±1', (100 * within1(final, SF)).toFixed(0) + '%');
console.log('params', JSON.stringify(Object.fromEntries(Object.entries(final).map(([k, v]) => [k, +v.toFixed(3)]))));

// surfline: rank correlation only (different scale)
const spearman = (x, y) => { const rank = a => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; }; const rx = rank(x), ry = rank(y), n = x.length, mx = rx.reduce((a, b) => a + b) / n, my = ry.reduce((a, b) => a + b) / n; let nu = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { nu += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; } return nu / Math.sqrt(dx * dy); };
console.log('Surfline spearman actual', spearman(SLS.map(s => model(CURRENT, s)), SLS.map(s => s.y)).toFixed(2), '| ajustado', spearman(SLS.map(s => model(final, s)), SLS.map(s => s.y)).toFixed(2));

const table = {};
for (const s of SF) (table[s.y] ??= []).push(model(final, s));
for (const [y, v] of Object.entries(table)) console.log('  sf=' + y, 'n=' + v.length, 'nuestro medio', (v.reduce((a, b) => a + b) / v.length).toFixed(1));
writeFileSync(new URL('fit-result.json', B), JSON.stringify(final, null, 1));
console.log('\nCopy these into src/services/star-engine.ts and update the anchor tests.');
