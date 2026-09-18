'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation } from 'lucide-react';
import { useStore } from '@/store/useStore';
// The slim index, not the full catalogue: surf config and provenance are
// server-side concerns and would otherwise ship in the JS bundle.
import { useCountryIndex, type IndexSpot } from '@/hooks/useCountryIndex';
import { qualityStyle, QualityStyle } from '@/services/conditions';
import { locationDefaults, regionBounds } from '@/services/regions';
import { chunkIndexById } from '@/services/spot-batches';
import { SpotHorizon, bestAt, bestByDay, ratingAt } from '@/services/map-summary';
import { instantAt, utcMsAt, MAX_FORECAST_HOURS } from '@/services/timeline';

const SPAIN_CENTER: [number, number] = [-3.7, 40.4];

/** Must match the server's BATCH_SIZE so client and server cut the same chunks. */
const BATCH_SIZE = 50;
/**
 * Chunk requests in flight at once. Kept low: Open-Meteo's free tier limits
 * calls per minute, and each chunk is two multi-location upstream calls.
 */
const MAX_CONCURRENT_CHUNKS = 2;
/** A rate-limited chunk is retried on its own rather than waiting for a pan. */
const CHUNK_RETRY_MS = 20_000;
/** A chunk carries the whole horizon; after this it is fetched again for the new model hour. */
const CHUNK_FRESH_MS = 60 * 60_000;
/**
 * Markers are DOM nodes, and a node per beach in a busy region stalls the main
 * thread on every pan. Only what is on screen, plus a margin, gets one.
 */
const MAX_MARKERS = 400;
const VIEWPORT_MARGIN = 0.35; // fraction of the viewport span, added each side
const MOVE_DEBOUNCE_MS = 400;

type Spot = IndexSpot;

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
  el.style.fontSize = `${Math.max(12, Math.round(style.size * 0.5))}px`;
  el.textContent = style.showScore ? String(stars) : '';
  el.style.zIndex = style.tier === 'epic' || style.tier === 'danger' ? '2' : '1';
}

export function MarineMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef(new Map<string, { marker: mapboxgl.Marker; el: HTMLElement }>());
  /** Every hour of the horizon for the current region and level, keyed by spot id. */
  const horizonsRef = useRef(new Map<string, SpotHorizon>());
  /** When each chunk was fetched; `0` while in flight. */
  const chunksRef = useRef(new Map<number, number>());
  /** Bumped whenever region or level change, so stale responses are ignored. */
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest scoreVisible, for retries scheduled by an older closure. */
  const scoreVisibleRef = useRef<(() => Promise<void>) | null>(null);

  const {
    userLocation,
    setUserLocation,
    setSelectedSpot,
    userSkillLevel,
    currentHour,
    selectedRegion,
    selectedCountry,
    selectedSpotId,
    resolveLocation,
    setSelectedCountry,
    setSelectedRegion,
    spotUtcOffsetSeconds,
    setMapSummary,
    setRegionBestToday,
  } = useStore();

  /** Only the selected country's spots are downloaded; the rest stay unfetched. */
  const countrySpots = useCountryIndex(selectedCountry);

  const [loading, setLoading] = useState(true);
  /**
   * In-flight chunks, labelled with the query they belong to. A stale label
   * simply stops counting, so switching region mid-load can never leave the
   * indicator stuck on screen.
   */
  const queryKey = `${selectedRegion}|${userSkillLevel}`;
  const [pending, setPending] = useState<{ key: string; n: number }>({ key: '', n: 0 });
  const pendingHere = pending.key === queryKey ? pending.n : 0;
  /** Spots in view with a rating, and whether the view has been scored at all. */
  const [inView, setInView] = useState<{ key: string; rated: number; scored: boolean }>({
    key: '',
    rated: 0,
    scored: false,
  });

  const regionSpots = useCallback(
    (): Spot[] => countrySpots.filter(spot => spot.community === selectedRegion),
    [countrySpots, selectedRegion]
  );

  /** Spots within the viewport widened by `margin`, so panning does not reveal bare sea. */
  const nearViewport = useCallback(
    (margin = VIEWPORT_MARGIN): Spot[] => {
      const map = mapRef.current;
      const inRegion = regionSpots();
      if (!map) return inRegion;
      const bounds = map.getBounds();
      if (!bounds) return inRegion;

      const latMargin = (bounds.getNorth() - bounds.getSouth()) * margin;
      const lonMargin = (bounds.getEast() - bounds.getWest()) * margin;
      return inRegion.filter(
        s =>
          s.coordinates.lat >= bounds.getSouth() - latMargin &&
          s.coordinates.lat <= bounds.getNorth() + latMargin &&
          s.coordinates.lon >= bounds.getWest() - lonMargin &&
          s.coordinates.lon <= bounds.getEast() + lonMargin
      );
    },
    [regionSpots]
  );

  const targetMs = useCallback(
    (hour: number) => utcMsAt(spotUtcOffsetSeconds, hour),
    [spotUtcOffsetSeconds]
  );

  /**
   * Brings the marker layer in line with the selected hour: a marker for every
   * nearby spot rated at that hour, and nothing else. A spot without data never
   * appears.
   */
  const reconcileMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = targetMs(currentHour);

    const wanted: Array<{ spot: Spot; stars: number; isDangerous: boolean }> = [];
    for (const spot of nearViewport()) {
      const horizon = horizonsRef.current.get(spot.id);
      const rating = horizon ? ratingAt(horizon, target) : null;
      if (rating) wanted.push({ spot, stars: rating.stars, isDangerous: rating.isDangerous });
      if (wanted.length >= MAX_MARKERS) break;
    }
    const wantedIds = new Set(wanted.map(w => w.spot.id));

    for (const [id, { marker }] of markersRef.current) {
      if (!wantedIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const { spot, stars, isDangerous } of wanted) {
      const style = qualityStyle(stars, { isDangerous });
      const existing = markersRef.current.get(spot.id);
      if (existing) {
        applyStyle(existing.el, style, stars);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'mapboxgl-marker custom-marker';
      el.dataset.testid = 'spot-marker';
      el.dataset.spotId = spot.id;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', spot.name);
      el.style.borderRadius = '50%';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontWeight = '700';
      el.title = spot.name;
      applyStyle(el, style, stars);
      el.addEventListener('click', event => {
        event.stopPropagation();
        setSelectedSpot(spot.id);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([spot.coordinates.lon, spot.coordinates.lat])
        .addTo(map);
      markersRef.current.set(spot.id, { marker, el });
    }
  }, [nearViewport, setSelectedSpot, targetMs, currentHour]);

  /** Ranks what is strictly on screen for the bottom sheet. */
  const publishSummary = useCallback(() => {
    const visible: SpotHorizon[] = [];
    for (const spot of nearViewport(0)) {
      const horizon = horizonsRef.current.get(spot.id);
      if (horizon) visible.push(horizon);
    }
    const now = new Date();
    const at = (h: number) => utcMsAt(spotUtcOffsetSeconds, h, now);
    const dayOf = (h: number) => instantAt(spotUtcOffsetSeconds, h, now).day;
    const hourCount = MAX_FORECAST_HOURS + 1;

    const best = bestAt(visible, at(currentHour));
    const byDay = bestByDay(visible, hourCount, at, dayOf);
    const rated = visible.filter(h => ratingAt(h, at(currentHour))).length;
    setMapSummary({ best, bestByDay: byDay, rated });
    setInView({ key: queryKey, rated, scored: chunksRef.current.size > 0 });

    // Today's best across the whole loaded region, for the region picker.
    const loaded = [...horizonsRef.current.values()];
    if (loaded.length > 0) {
      const today = dayOf(0);
      let hours = 0;
      while (hours < hourCount && dayOf(hours) === today) hours++;
      const regionToday = bestByDay(loaded, hours, at, dayOf)[today];
      if (regionToday !== undefined && regionToday >= 0) setRegionBestToday(selectedRegion, regionToday);
    }
  }, [nearViewport, spotUtcOffsetSeconds, currentHour, setMapSummary, setRegionBestToday, selectedRegion, queryKey]);

  /**
   * Scores every spot near the viewport, a chunk at a time. Chunks are fixed
   * per region (see spot-batches) and carry the whole horizon, so a chunk is
   * requested once per hour of model data whatever the slider does.
   */
  const scoreVisible = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    // An open spot gets the upstream quota to itself: map chunks for a large
    // region can spend a whole minute's worth and leave the detail blank.
    if (selectedSpotId) return;
    const generation = generationRef.current;
    const now = Date.now();

    const chunkOf = chunkIndexById(countrySpots, selectedRegion, BATCH_SIZE);
    const needed = [
      ...new Set(nearViewport().map(s => chunkOf.get(s.id)).filter((c): c is number => c !== undefined)),
    ].filter(c => {
      const fetchedAt = chunksRef.current.get(c);
      if (fetchedAt === undefined) return true;
      return fetchedAt !== 0 && now - fetchedAt > CHUNK_FRESH_MS;
    });

    if (needed.length === 0) {
      publishSummary();
      return;
    }
    needed.forEach(c => chunksRef.current.set(c, 0));
    const key = queryKey;
    setPending(p => ({ key, n: (p.key === key ? p.n : 0) + needed.length }));

    const names = new Map(regionSpots().map(s => [s.id, s.name]));

    await mapWithLimit(needed, MAX_CONCURRENT_CHUNKS, async chunk => {
      try {
        const res = await fetch(
          `/api/forecast/batch?region=${encodeURIComponent(selectedRegion)}&chunk=${chunk}&level=${userSkillLevel}`
        );
        if (generation !== generationRef.current) return;
        if (!res.ok) {
          chunksRef.current.delete(chunk);
          // Retry by itself: without this, a 429 left a patch of the map empty
          // until the user happened to pan.
          setTimeout(() => {
            if (generation === generationRef.current) scoreVisibleRef.current?.();
          }, CHUNK_RETRY_MS);
          return;
        }
        const data = await res.json();
        if (generation !== generationRef.current) return;
        const startMs = Date.parse(`${data.start}:00Z`);
        for (const r of data.results ?? []) {
          if (!r.hasData) {
            horizonsRef.current.delete(r.id);
            continue;
          }
          horizonsRef.current.set(r.id, {
            id: r.id,
            name: names.get(r.id) ?? r.id,
            startMs,
            stars: r.stars ?? [],
            swellStars: r.swellStars ?? [],
            height: r.height ?? [],
            period: r.period ?? [],
            danger: r.danger ?? [],
          });
        }
        chunksRef.current.set(chunk, Date.now());
        reconcileMarkers();
        publishSummary();
      } catch {
        if (generation === generationRef.current) chunksRef.current.delete(chunk);
      } finally {
        setPending(p => (p.key === key ? { key, n: Math.max(0, p.n - 1) } : p));
      }
    });
  }, [nearViewport, reconcileMarkers, publishSummary, regionSpots, countrySpots, selectedRegion, selectedSpotId, userSkillLevel, queryKey]);

  useEffect(() => {
    scoreVisibleRef.current = scoreVisible;
  }, [scoreVisible]);

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: userLocation ? [userLocation.lon, userLocation.lat] : SPAIN_CENTER,
      zoom: userLocation ? 8 : 5,
      attributionControl: false,
      // Mapbox's terms require the logo and credits to stay visible, so they sit
      // in the quietest corner and the sheet is kept off them (see globals.css).
      logoPosition: 'bottom-left',
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

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

  // A new region or level invalidates every rating and fetched chunk. The hour
  // does not: every chunk already holds the whole horizon.
  useEffect(() => {
    generationRef.current += 1;
    horizonsRef.current.clear();
    chunksRef.current.clear();
  }, [selectedRegion, userSkillLevel]);

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
      { padding: { top: 90, bottom: 320, left: 40, right: 40 }, maxZoom: 9, duration: 900 }
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

  /** Centres on the user; if they are on another coast, switches to its region. */
  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setUserLocation(latitude, longitude);
        const { country, region } = locationDefaults(latitude, longitude);
        if (region !== selectedRegion) {
          setSelectedCountry(country);
          setSelectedRegion(region);
          return;
        }
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 10, duration: 900 });
      },
      err => console.warn('Geolocation unavailable:', err.message)
    );
  };

  const showEmpty = !loading && pendingHere === 0 && inView.key === queryKey && inView.scored && inView.rated === 0;

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ground">
          <div className="flex items-center gap-2.5 text-[13px] text-ink-2" role="status">
            <span className="w-2 h-2 rounded-full bg-epic animate-pulse" />
            Loading map
          </div>
        </div>
      )}
      {!loading && pendingHere > 0 && (
        <div
          data-testid="scoring-indicator"
          role="status"
          className="absolute top-[76px] left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 h-9 px-3.5 rounded-full bg-sheet/90 backdrop-blur-md border border-line text-[13px] text-ink-1 whitespace-nowrap"
        >
          <span className="w-2 h-2 rounded-full bg-epic animate-pulse" />
          Rating spots…
        </div>
      )}
      {showEmpty && (
        <div
          data-testid="map-empty"
          role="status"
          className="absolute top-[76px] left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-0.5 px-4 py-2.5 rounded-2xl bg-sheet/90 backdrop-blur-md border border-line text-center whitespace-nowrap"
        >
          <span className="text-[14px] font-medium text-ink-0">No spots in view</span>
          <span className="text-[13px] text-ink-2">Zoom out or pick another region.</span>
        </div>
      )}
      <button
        type="button"
        onClick={locate}
        aria-label="Centre on my location"
        data-testid="locate-button"
        className="absolute right-4 top-[76px] z-10 w-11 h-11 rounded-full bg-sheet/90 backdrop-blur-md border border-line flex items-center justify-center text-ink-1 hover:text-white transition-colors"
      >
        <Navigation size={17} />
      </button>
      <div ref={mapContainerRef} className="mapboxgl-map w-full h-full" />
    </div>
  );
}
