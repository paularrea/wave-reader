/**
 * Stable batching of a region's spots.
 *
 * Client and server must agree on which spots share a batch, and the batches
 * must not change with the viewport: identical batches mean identical upstream
 * URLs for every visitor in the same hour, which the data cache can reuse.
 * Spots are ordered by id within their region and cut into fixed-size chunks.
 */
export interface BatchableSpot {
  id: string;
  community: string;
}

export function regionOrder<T extends BatchableSpot>(spots: T[], region: string): T[] {
  return spots.filter(s => s.community === region).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function chunkIndexById<T extends BatchableSpot>(
  spots: T[],
  region: string,
  size: number
): Map<string, number> {
  const index = new Map<string, number>();
  regionOrder(spots, region).forEach((spot, i) => index.set(spot.id, Math.floor(i / size)));
  return index;
}
