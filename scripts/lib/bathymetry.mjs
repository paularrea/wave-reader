/**
 * Local ETOPO1 elevation/bathymetry lookup.
 *
 * Stage 2 used to ask a public elevation API for every probe point. Both
 * sources tried hit a quota partway through a single country: Open-Meteo's
 * elevation endpoint shares an account-wide daily cap with the forecast API the
 * app depends on, and OpenTopoData's public instance allows 1,000 calls a day.
 *
 * NOAA's ERDDAP serves the same ETOPO1 grid (1 arc-minute, with bathymetry) in
 * rectangular slices, so this module downloads 5x5 degree tiles once, caches
 * them on disk, and answers lookups locally with no rate limit at all. A
 * control point confirms it is the same dataset: 43.9 N, 9.5 W reads -2676 m
 * from both ERDDAP and OpenTopoData.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv';
const CACHE_DIR = new URL('../../.cache/etopo/', import.meta.url);
const TILE_DEG = 5;
const CELLS_PER_DEG = 60; // 1 arc-minute

/** One tile: a dense grid of elevations in metres, row-major from its south-west corner. */
class Tile {
  constructor(south, west, values) {
    this.south = south;
    this.west = west;
    this.size = TILE_DEG * CELLS_PER_DEG + 1;
    this.values = values;
  }

  cell(row, col) {
    if (row < 0 || col < 0 || row >= this.size || col >= this.size) return null;
    const v = this.values[row * this.size + col];
    return Number.isNaN(v) ? null : v;
  }

  /**
   * Bilinear interpolation between the four surrounding cells.
   *
   * Nearest-cell lookup disagreed with OpenTopoData, which interpolates, on
   * 20 of 45 sampled spots: along a coastline the probe point often sits
   * between a land cell and a sea cell, and picking either one flips whether
   * that bearing counts as open water. Interpolating keeps Spain and Ireland,
   * built through the API, consistent with regions built from local tiles.
   */
  at(lat, lon) {
    const y = (lat - this.south) * CELLS_PER_DEG;
    const x = (lon - this.west) * CELLS_PER_DEG;
    const r0 = Math.floor(y);
    const c0 = Math.floor(x);
    const fy = y - r0;
    const fx = x - c0;

    const v00 = this.cell(r0, c0);
    const v01 = this.cell(r0, c0 + 1);
    const v10 = this.cell(r0 + 1, c0);
    const v11 = this.cell(r0 + 1, c0 + 1);
    if (v00 === null || v01 === null || v10 === null || v11 === null) {
      return this.cell(Math.round(y), Math.round(x));
    }

    const south = v00 * (1 - fx) + v01 * fx;
    const north = v10 * (1 - fx) + v11 * fx;
    return south * (1 - fy) + north * fy;
  }
}

function tileKey(lat, lon) {
  const south = Math.floor(lat / TILE_DEG) * TILE_DEG;
  const west = Math.floor(lon / TILE_DEG) * TILE_DEG;
  return { south, west, key: `${south}_${west}` };
}

async function downloadTile(south, west, log, attempt = 0) {
  const north = south + TILE_DEG;
  const east = west + TILE_DEG;
  const query = `altitude[(${south}):1:(${north})][(${west}):1:(${east})]`;
  const url = `${ERDDAP}?${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`ERDDAP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 5) throw new Error(`tile ${south},${west}: ${err.message}`);
    log?.(`    tile ${south},${west} failed (${err.message}), retrying`);
    await sleep(10_000 * (attempt + 1));
    return downloadTile(south, west, log, attempt + 1);
  }
}

function parseTile(csv, south, west) {
  const size = TILE_DEG * CELLS_PER_DEG + 1;
  const values = new Float32Array(size * size).fill(Number.NaN);
  const lines = csv.split('\n');

  // Line 0 is the header, line 1 the units row.
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const [latS, lonS, altS] = line.split(',');
    const row = Math.round((Number(latS) - south) * CELLS_PER_DEG);
    const col = Math.round((Number(lonS) - west) * CELLS_PER_DEG);
    if (row < 0 || col < 0 || row >= size || col >= size) continue;
    values[row * size + col] = Number(altS);
  }
  return values;
}

export class Bathymetry {
  constructor(log) {
    this.log = log;
    this.tiles = new Map();
  }

  /** Downloads (or reads from cache) every tile the given points fall in. */
  async prepare(points) {
    await mkdir(CACHE_DIR, { recursive: true });

    const needed = new Map();
    for (const p of points) {
      const t = tileKey(p.lat, p.lon);
      needed.set(t.key, t);
    }

    let i = 0;
    for (const { south, west, key } of needed.values()) {
      i++;
      if (this.tiles.has(key)) continue;

      const path = new URL(`${key}.csv`, CACHE_DIR);
      let csv;
      try {
        csv = await readFile(path, 'utf8');
      } catch {
        this.log?.(`  downloading tile ${i}/${needed.size} (${south}N ${west}E)`);
        csv = await downloadTile(south, west, this.log);
        await writeFile(path, csv);
      }
      this.tiles.set(key, new Tile(south, west, parseTile(csv, south, west)));
    }
  }

  /** Elevation in metres (negative at sea), or null outside the prepared tiles. */
  at(lat, lon) {
    const tile = this.tiles.get(tileKey(lat, lon).key);
    return tile ? tile.at(lat, lon) : null;
  }
}
