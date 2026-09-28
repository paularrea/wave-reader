'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation } from 'lucide-react';
import { useStore } from '@/store/useStore';
// The slim index, not the full catalogue: surf config and provenance are
// server-side concerns and would otherwise ship in the JS bundle.
import { useCountryIndexes, type IndexSpot } from '@/hooks/useCountryIndex';
import { qualityStyle, QualityStyle } from '@/services/conditions';
import {
  AUTO_REGION_ZOOM,
  CLOSE_ZOOM,
  countryOfRegion,
  locationDefaults,
  openingBounds,
  regionBounds,
  regionsInBounds,
  widen,
  type ViewBounds,
} from '@/services/regions';
import { chunkIndexById } from '@/services/spot-batches';
import { SpotHorizon, bestAt, bestByDay, ratingAt } from '@/services/map-summary';
import { instantAt, utcMsAt, MAX_FORECAST_HOURS } from '@/services/timeline';
import { MAP_STYLE, currentTheme } from '@/services/theme';
import { useTheme } from '@/hooks/useTheme';
import { BrandMark } from './BrandMark';

const SPAIN_CENTER: [number, number] = [-3.7, 40.4];
/** Room for the header above and the sheet below whatever is framed. */
const FRAME_PADDING = { top: 90, bottom: 320, left: 40, right: 40 };

const lngLatBox = (box: ViewBounds): [[number, number], [number, number]] => [
  [box.west, box.south],
  [box.east, box.north],
];

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
  /** Every hour of the horizon for each spot scored at the current level, keyed by spot id. */
  const horizonsRef = useRef(new Map<string, SpotHorizon>());
  /** When each chunk ("region#index") was fetched; `0` while in flight. */
  const chunksRef = useRef(new Map<string, number>());
  /** Bumped whenever the level changes, so stale responses are ignored. */
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest scoreVisible, for retries scheduled by an older closure. */
  const scoreVisibleRef = useRef<(() => Promise<void>) | null>(null);
  /** Set when the surfer, not the app, started the move under way. */
  const userMovedRef = useRef(false);

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
    goToLocation,
    followRegion,
    framing,
    spotUtcOffsetSeconds,
    setMapSummary,
    setRegionBestToday,
  } = useStore();

  /**
   * What the viewport covers. Zoomed in on a coast, the map scores every region
   * with spots near it, so panning from one region into the next brings its
   * spots along; zoomed out, only the picked region (see AUTO_REGION_ZOOM).
   */
  const [view, setView] = useState<{ zoomedIn: boolean; regions: string[] }>({ zoomedIn: false, regions: [] });
  const activeKey = (view.zoomedIn ? view.regions : [selectedRegion]).join('|');
  const activeRegions = useMemo(() => (activeKey ? activeKey.split('|') : []), [activeKey]);

  /** Only the countries in play are downloaded; the rest stay unfetched. */
  const spots = useCountryIndexes([selectedCountry, ...activeRegions.map(countryOfRegion)]);
  const { theme } = useTheme();
  /** The basemap the map was last given, so a theme change swaps it exactly once. */
  const styleRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  /**
   * In-flight chunks, labelled with the level they were asked for. A stale
   * label simply stops counting, so changing level mid-load can never leave
   * the indicator stuck on screen.
   */
  const [pending, setPending] = useState<{ key: string; n: number }>({ key: '', n: 0 });
  const pendingHere = pending.key === userSkillLevel ? pending.n : 0;
  /** Spots in view with a rating, and whether the view has been scored at all. */
  const queryKey = `${activeKey}|${userSkillLevel}`;
  const [inView, setInView] = useState<{ key: string; rated: number; scored: boolean }>({
    key: '',
    rated: 0,
    scored: false,
  });

  const activeSpots = useCallback(
    (): Spot[] => spots.filter(spot => activeRegions.includes(spot.community)),
    [spots, activeRegions]
  );

  /** Spots within the viewport widened by `margin`, so panning does not reveal bare sea. */
  const nearViewport = useCallback(
    (margin = VIEWPORT_MARGIN): Spot[] => {
      const map = mapRef.current;
      const inPlay = activeSpots();
      if (!map) return inPlay;
      const bounds = map.getBounds();
      if (!bounds) return inPlay;

      const latMargin = (bounds.getNorth() - bounds.getSouth()) * margin;
      const lonMargin = (bounds.getEast() - bounds.getWest()) * margin;
      return inPlay.filter(
        s =>
          s.coordinates.lat >= bounds.getSouth() - latMargin &&
          s.coordinates.lat <= bounds.getNorth() + latMargin &&
          s.coordinates.lon >= bounds.getWest() - lonMargin &&
          s.coordinates.lon <= bounds.getEast() + lonMargin
      );
    },
    [activeSpots]
  );

  /**
   * Reads the viewport after a move: which regions it reaches, and -- when the
   * surfer moved it -- which one it mostly shows, which becomes the picked
   * region without moving the camera. Counted on the coarse points every client
   * has, so a region is found before its country's index is downloaded.
   */
  const readView = useCallback(
    (userMoved: boolean) => {
      const map = mapRef.current;
      const b = map?.getBounds();
      if (!map || !b) return;
      const bounds: ViewBounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      const zoomedIn = map.getZoom() >= AUTO_REGION_ZOOM;
      const regions = zoomedIn ? regionsInBounds(widen(bounds, VIEWPORT_MARGIN)).map(r => r.region) : [];
      setView(prev =>
        prev.zoomedIn === zoomedIn && prev.regions.join('|') === regions.join('|') ? prev : { zoomedIn, regions }
      );
      if (!zoomedIn || !userMoved) return;
      // The region with most spots strictly on screen is the one the picker names.
      const top = regionsInBounds(bounds)[0];
      if (top && top.region !== useStore.getState().selectedRegion) followRegion(top.country, top.region);
    },
    [followRegion]
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
      const style = qualityStyle(stars, { isDangerous, theme });
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
  }, [nearViewport, setSelectedSpot, targetMs, currentHour, theme]);

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

    // Today's best in each region scored so far, for the region picker.
    const byRegion = new Map<string, SpotHorizon[]>();
    for (const spot of activeSpots()) {
      const horizon = horizonsRef.current.get(spot.id);
      if (!horizon) continue;
      if (!byRegion.has(spot.community)) byRegion.set(spot.community, []);
      byRegion.get(spot.community)!.push(horizon);
    }
    if (byRegion.size > 0) {
      const today = dayOf(0);
      let hours = 0;
      while (hours < hourCount && dayOf(hours) === today) hours++;
      for (const [region, loaded] of byRegion) {
        const regionToday = bestByDay(loaded, hours, at, dayOf)[today];
        if (regionToday !== undefined && regionToday >= 0) setRegionBestToday(region, regionToday);
      }
    }
  }, [nearViewport, activeSpots, spotUtcOffsetSeconds, currentHour, setMapSummary, setRegionBestToday, queryKey]);

  /**
   * Scores every spot near the viewport, a chunk at a time. Chunks are fixed
   * per region (see spot-batches) and carry the whole horizon, so a chunk is
   * requested once per hour of model data whatever the slider does -- and once
   * whichever region the map was following when it was fetched.
   */
  const scoreVisible = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    // An open spot gets the upstream quota to itself: map chunks for a large
    // region can spend a whole minute's worth and leave the detail blank.
    if (selectedSpotId) return;
    const generation = generationRef.current;
    const now = Date.now();

    const chunkMaps = new Map<string, Map<string, number>>();
    const wanted = new Map<string, { region: string; chunk: number }>();
    for (const spot of nearViewport()) {
      if (!chunkMaps.has(spot.community)) chunkMaps.set(spot.community, chunkIndexById(spots, spot.community, BATCH_SIZE));
      const chunk = chunkMaps.get(spot.community)!.get(spot.id);
      if (chunk !== undefined) wanted.set(`${spot.community}#${chunk}`, { region: spot.community, chunk });
    }
    const needed = [...wanted].filter(([key]) => {
      const fetchedAt = chunksRef.current.get(key);
      if (fetchedAt === undefined) return true;
      return fetchedAt !== 0 && now - fetchedAt > CHUNK_FRESH_MS;
    });

    if (needed.length === 0) {
      publishSummary();
      return;
    }
    needed.forEach(([key]) => chunksRef.current.set(key, 0));
    const level = userSkillLevel;
    setPending(p => ({ key: level, n: (p.key === level ? p.n : 0) + needed.length }));

    const names = new Map(spots.map(s => [s.id, s.name]));

    await mapWithLimit(needed, MAX_CONCURRENT_CHUNKS, async ([chunkKey, { region, chunk }]) => {
      try {
        const res = await fetch(
          `/api/forecast/batch?region=${encodeURIComponent(region)}&chunk=${chunk}&level=${level}`
        );
        if (generation !== generationRef.current) return;
        if (!res.ok) {
          chunksRef.current.delete(chunkKey);
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
        chunksRef.current.set(chunkKey, Date.now());
        reconcileMarkers();
        publishSummary();
      } catch {
        if (generation === generationRef.current) chunksRef.current.delete(chunkKey);
      } finally {
        setPending(p => (p.key === level ? { key: level, n: Math.max(0, p.n - 1) } : p));
      }
    });
  }, [nearViewport, reconcileMarkers, publishSummary, spots, selectedSpotId, userSkillLevel]);

  useEffect(() => {
    scoreVisibleRef.current = scoreVisible;
  }, [scoreVisible]);

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
    if (!mapContainerRef.current) return;

    // Read from the page, not the hook: on the first effect after hydration the
    // hook can still hold the server's guess.
    styleRef.current = MAP_STYLE[currentTheme()];
    // Open close in, where the first framing will settle, rather than on the
    // whole country: nothing is scored for a view nobody asked for.
    const opening = framing.kind === 'open' ? openingBounds(framing.region, framing.near ?? userLocation) : null;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: styleRef.current,
      ...(opening
        ? { bounds: lngLatBox(opening), fitBoundsOptions: { padding: FRAME_PADDING, maxZoom: CLOSE_ZOOM } }
        : { center: SPAIN_CENTER, zoom: 5 }),
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
          resolveLocation(country, region, { lat: latitude, lon: longitude });
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

  // Light or dark basemap with the theme. Markers are DOM nodes, not layers, so
  // they survive the swap and only their colours are re-applied.
  // The page is the source of truth: during hydration the hook briefly holds
  // the server's guess, and following it would load the wrong style first.
  useEffect(() => {
    const map = mapRef.current;
    const wanted = MAP_STYLE[currentTheme()];
    if (!map || styleRef.current === wanted) return;
    styleRef.current = wanted;
    map.setStyle(wanted);
  }, [theme]);

  // A new level invalidates every rating and fetched chunk. The hour does not --
  // every chunk already holds the whole horizon -- and neither does the region:
  // a spot's rating is the same whichever region the map is following.
  useEffect(() => {
    generationRef.current += 1;
    horizonsRef.current.clear();
    chunksRef.current.clear();
  }, [userSkillLevel]);

  useEffect(() => {
    if (!mapRef.current || loading) return;
    reconcileMarkers();
    scoreVisible();
  }, [reconcileMarkers, scoreVisible, loading]);

  /**
   * Moves the camera when asked to (see Framing in the store): the whole region
   * when one is picked from the list, close in on the surfer's coast when it is
   * found. Only a new request moves it. Tying the camera to the region once
   * yanked a zoomed-in user back out on every hour step, and would now fight
   * the surfer every time the map follows them into the next region.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;
    if (framing.kind === 'region') {
      const box = regionBounds(framing.region);
      if (!box) return;
      map.fitBounds(lngLatBox(box), { padding: FRAME_PADDING, maxZoom: 9, duration: 900 });
      return;
    }
    const box = openingBounds(framing.region, framing.near);
    if (!box) return;
    const camera = map.cameraForBounds(lngLatBox(box), { padding: FRAME_PADDING, maxZoom: CLOSE_ZOOM });
    if (!camera?.center) return;
    // Never so far out that the map stops following the viewport.
    const zoom = Math.max(camera.zoom ?? CLOSE_ZOOM, AUTO_REGION_ZOOM + 1);
    map.easeTo({ center: camera.center, zoom, duration: 900 });
    // The request, not the objects it carries: a new nonce is a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framing.nonce, loading]);

  // Panning and zooming bring new spots, and new regions, near the viewport.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    // Only a move with an input event behind it (drag, pinch, wheel) is the
    // surfer's; fitBounds and easeTo carry none.
    const onMoveStart = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) userMovedRef.current = true;
    };
    const onMoveEnd = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const userMoved = userMovedRef.current;
        userMovedRef.current = false;
        readView(userMoved);
        reconcileMarkers();
        scoreVisible();
      }, MOVE_DEBOUNCE_MS);
    };

    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [reconcileMarkers, scoreVisible, readView, loading]);

  // The first reading, before anything has moved.
  useEffect(() => {
    if (!loading) readView(false);
  }, [loading, readView]);

  /** Centres on the surfer's coast, switching region if they are on another one. */
  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setUserLocation(latitude, longitude);
        const { country, region } = locationDefaults(latitude, longitude);
        goToLocation(country, region, { lat: latitude, lon: longitude });
      },
      err => console.warn('Geolocation unavailable:', err.message)
    );
  };

  const showEmpty = !loading && pendingHere === 0 && inView.key === queryKey && inView.scored && inView.rated === 0;
  /** Zoomed out past the point where the map follows the viewport, and nothing picked is in it. */
  const zoomHint = showEmpty && !view.zoomedIn;

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ground">
          <div className="flex flex-col items-center gap-3 text-[13px] text-ink-2" role="status">
            <BrandMark size={36} className="text-ink-0 animate-pulse" />
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
          <span className="text-[13px] text-ink-2">
            {zoomHint ? 'Zoom in on a coast, or pick a region.' : 'Pan along the coast or pick a region.'}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={locate}
        aria-label="Centre on my location"
        data-testid="locate-button"
        className="absolute right-4 top-[76px] z-10 w-11 h-11 rounded-full bg-sheet/90 backdrop-blur-md border border-line flex items-center justify-center text-ink-1 hover:text-ink-0 transition-colors"
      >
        <Navigation size={17} />
      </button>
      <div ref={mapContainerRef} className="mapboxgl-map w-full h-full" />
    </div>
  );
}
