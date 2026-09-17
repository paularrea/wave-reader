'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useStore } from '@/store/useStore';
// The slim index, not the full catalogue: surf config and provenance are
// server-side concerns and would otherwise ship in the JS bundle.
import spots from '@/data/spots.index.json';
import { qualityStyle, QualityStyle } from '@/services/conditions';
import { locationDefaults, regionBounds } from '@/services/regions';
import { chunkIndexById } from '@/services/spot-batches';

const SPAIN_CENTER: [number, number] = [-3.7, 40.4];

/** Must match the server's BATCH_SIZE so client and server cut the same chunks. */
const BATCH_SIZE = 50;
/** Chunk requests in flight at once; each chunk is two upstream calls. */
const MAX_CONCURRENT_CHUNKS = 4;
/**
 * Markers are DOM nodes, and a node per beach in a busy region stalls the main
 * thread on every pan. Only what is on screen, plus a margin, gets one.
 */
const MAX_MARKERS = 400;
const VIEWPORT_MARGIN = 0.35; // fraction of the viewport span, added each side
const MOVE_DEBOUNCE_MS = 400;

interface Rating {
  hasData: boolean;
  stars: number;
  unrated: boolean;
  isDangerous: boolean;
}

type Spot = (typeof spots)[number];

/** Runs `worker` over `items`, at most `limit` in flight at any moment. */
async function mapWithLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function applyStyle(el: HTMLElement, style: QualityStyle, stars: number) {
  el.dataset.tier = style.tier;
  el.dataset.stars = String(stars);
  el.dataset.dangerous = String(style.tier === 'danger');
  el.style.width = `${style.size}px`;
  el.style.height = `${style.size}px`;
  el.style.backgroundColor = style.background;
  el.style.border = style.border;
  el.style.boxShadow = style.boxShadow;
  el.style.color = style.foreground;
  el.style.fontSize = `${Math.round(style.size * 0.45)}px`;
  el.textContent = style.showScore ? String(stars) : '';
  el.style.zIndex = style.tier === 'epic' || style.tier === 'danger' ? '2' : '1';
}

export function MarineMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef(new Map<string, { marker: mapboxgl.Marker; el: HTMLElement }>());
  /** Ratings for the current region, hour and level, keyed by spot id. */
  const ratingsRef = useRef(new Map<string, Rating>());
  /** Chunks already fetched or in flight for the current region, hour and level. */
  const chunksRef = useRef(new Set<number>());
  /** Bumped whenever region, hour or level change, so stale responses are ignored. */
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    userLocation,
    setUserLocation,
    setSelectedSpot,
    userSkillLevel,
    currentHour,
    selectedRegion,
    resolveLocation,
  } = useStore();

  const [loading, setLoading] = useState(true);
  /**
   * In-flight chunks, labelled with the query they belong to. A stale label
   * simply stops counting, so switching region mid-load can never leave the
   * "Scoring" chip stuck on screen.
   */
  const queryKey = `${selectedRegion}|${currentHour}|${userSkillLevel}`;
  const [pending, setPending] = useState<{ key: string; n: number }>({ key: '', n: 0 });
  const pendingHere = pending.key === queryKey ? pending.n : 0;

  const regionSpots = useCallback(
    (): Spot[] => spots.filter(spot => spot.community === selectedRegion),
    [selectedRegion]
  );

  /** Spots within the viewport plus a margin, so panning does not reveal bare sea. */
  const nearViewport = useCallback((): Spot[] => {
    const map = mapRef.current;
    const inRegion = regionSpots();
    if (!map) return inRegion;
    const bounds = map.getBounds();
    if (!bounds) return inRegion;

    const latMargin = (bounds.getNorth() - bounds.getSouth()) * VIEWPORT_MARGIN;
    const lonMargin = (bounds.getEast() - bounds.getWest()) * VIEWPORT_MARGIN;
    return inRegion.filter(
      s =>
        s.coordinates.lat >= bounds.getSouth() - latMargin &&
        s.coordinates.lat <= bounds.getNorth() + latMargin &&
        s.coordinates.lon >= bounds.getWest() - lonMargin &&
        s.coordinates.lon <= bounds.getEast() + lonMargin
    );
  }, [regionSpots]);

  /**
   * Brings the marker layer in line with what should be visible: a marker for
   * every nearby spot that has a rating with data, and nothing else. There are
   * no placeholder markers -- a spot without data never appears.
   */
  const reconcileMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const wanted = nearViewport()
      .filter(s => ratingsRef.current.get(s.id)?.hasData)
      .slice(0, MAX_MARKERS);
    const wantedIds = new Set(wanted.map(s => s.id));

    for (const [id, { marker }] of markersRef.current) {
      if (!wantedIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const spot of wanted) {
      const rating = ratingsRef.current.get(spot.id)!;
      const style = qualityStyle(rating.stars, { isDangerous: rating.isDangerous });
      const existing = markersRef.current.get(spot.id);
      if (existing) {
        applyStyle(existing.el, style, rating.stars);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'mapboxgl-marker custom-marker';
      el.dataset.testid = 'spot-marker';
      el.dataset.spotId = spot.id;
      el.style.borderRadius = '50%';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontWeight = '800';
      el.title = spot.name;
      applyStyle(el, style, rating.stars);
      el.addEventListener('click', event => {
        event.stopPropagation();
        setSelectedSpot(spot.id);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([spot.coordinates.lon, spot.coordinates.lat])
        .addTo(map);
      markersRef.current.set(spot.id, { marker, el });
    }
  }, [nearViewport, setSelectedSpot]);

  /**
   * Scores every spot near the viewport, a chunk at a time. Chunks are fixed
   * per region (see spot-batches), so the same chunk is never requested twice
   * for the same hour and level, and every visitor shares upstream cache hits.
   */
  const scoreVisible = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const generation = generationRef.current;

    const chunkOf = chunkIndexById(spots, selectedRegion, BATCH_SIZE);
    const needed = [
      ...new Set(nearViewport().map(s => chunkOf.get(s.id)).filter((c): c is number => c !== undefined)),
    ].filter(c => !chunksRef.current.has(c));

    if (needed.length === 0) return;
    needed.forEach(c => chunksRef.current.add(c));
    const key = `${selectedRegion}|${currentHour}|${userSkillLevel}`;
    setPending(p => ({ key, n: (p.key === key ? p.n : 0) + needed.length }));

    await mapWithLimit(needed, MAX_CONCURRENT_CHUNKS, async chunk => {
      try {
        const res = await fetch(
          `/api/forecast/batch?region=${encodeURIComponent(selectedRegion)}&chunk=${chunk}` +
            `&hour=${currentHour}&level=${userSkillLevel}`
        );
        if (generation !== generationRef.current) return;
        if (!res.ok) {
          // Let a later pan retry this chunk rather than marking it done.
          chunksRef.current.delete(chunk);
          return;
        }
        const data = await res.json();
        if (generation !== generationRef.current) return;
        for (const r of data.results ?? []) {
          ratingsRef.current.set(r.id, {
            hasData: Boolean(r.hasData),
            stars: r.stars,
            unrated: r.unrated,
            isDangerous: r.isDangerous,
          });
        }
        reconcileMarkers();
      } catch {
        if (generation === generationRef.current) chunksRef.current.delete(chunk);
      } finally {
        setPending(p => (p.key === key ? { key, n: Math.max(0, p.n - 1) } : p));
      }
    });
  }, [nearViewport, reconcileMarkers, selectedRegion, currentHour, userSkillLevel]);

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: userLocation ? [userLocation.lon, userLocation.lat] : SPAIN_CENTER,
      zoom: userLocation ? 8 : 5,
    });

    // No NavigationControl: the map is driven by pinch, scroll and double-tap.
    mapRef.current = map;
    const markers = markersRef.current;

    if (!userLocation && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          setUserLocation(latitude, longitude);
          const { country, region } = locationDefaults(latitude, longitude);
          resolveLocation(country, region);
        },
        err => console.warn('Geolocation unavailable:', err.message)
      );
    }

    // With the style already cached the map can finish loading before this
    // listener attaches, and the event is then missed for good.
    const onReady = () => setLoading(false);
    if (map.loaded()) {
      onReady();
    } else {
      map.once('load', onReady);
      map.once('idle', onReady);
    }

    return () => {
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
    // Mount-only: re-running would tear down the map on every store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new region, hour or level invalidates every rating and fetched chunk.
  useEffect(() => {
    generationRef.current += 1;
    ratingsRef.current.clear();
    chunksRef.current.clear();
  }, [selectedRegion, currentHour, userSkillLevel]);

  useEffect(() => {
    if (!mapRef.current || loading) return;
    reconcileMarkers();
    scoreVisible();
  }, [reconcileMarkers, scoreVisible, loading]);

  /**
   * Frames the region, but only when the region itself changes. Tying this to
   * marker rendering once yanked a zoomed-in user back out on every hour step.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;
    const box = regionBounds(selectedRegion);
    if (!box) return;
    map.fitBounds(
      [
        [box.west, box.south],
        [box.east, box.north],
      ],
      { padding: 60, maxZoom: 9, duration: 900 }
    );
  }, [selectedRegion, loading]);

  // Panning and zooming bring new spots near the viewport.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    const onMoveEnd = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        reconcileMarkers();
        scoreVisible();
      }, MOVE_DEBOUNCE_MS);
    };

    map.on('moveend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [reconcileMarkers, scoreVisible, loading]);

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
          <div className="text-white font-medium animate-pulse">Loading Marine Data...</div>
        </div>
      )}
      {!loading && pendingHere > 0 && (
        <div
          data-testid="scoring-indicator"
          className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/85 backdrop-blur-md border border-zinc-800 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400"
        >
          Scoring spots…
        </div>
      )}
      <div ref={mapContainerRef} className="mapboxgl-map w-full h-full" />
    </div>
  );
}
