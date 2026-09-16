'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useStore } from '@/store/useStore';
import spots from '@/data/spots.json';
import { qualityStyle, QualityStyle } from '@/services/conditions';
import { locationDefaults, regionBounds } from '@/services/regions';

const SPAIN_CENTER: [number, number] = [-3.7, 40.4];

/**
 * Open-Meteo is a free service and every spot costs two upstream calls, so the
 * map never fetches the whole region at once: it renders every marker
 * immediately as "no data" and then fills in only what the user is looking at.
 */
const MAX_CONCURRENT_FETCHES = 6;
/** Beyond this many visible spots, scoring all of them helps nobody. */
const MAX_SPOTS_PER_VIEWPORT = 60;
const MOVE_DEBOUNCE_MS = 400;

interface Rating {
  stars: number;
  unrated: boolean;
  isDangerous: boolean;
}

/** Runs `worker` over `items`, at most `limit` in flight at any moment. */
async function mapWithLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function applyStyle(el: HTMLElement, style: QualityStyle, stars: number | null) {
  el.dataset.tier = style.tier;
  el.dataset.stars = stars === null ? '' : String(stars);
  el.dataset.dangerous = String(style.tier === 'danger');
  el.style.width = `${style.size}px`;
  el.style.height = `${style.size}px`;
  el.style.backgroundColor = style.background;
  el.style.border = style.border;
  el.style.boxShadow = style.boxShadow;
  el.style.color = style.foreground;
  el.style.fontSize = `${Math.round(style.size * 0.45)}px`;
  el.textContent = style.showScore && stars !== null ? String(stars) : '';
  el.style.zIndex = style.tier === 'epic' || style.tier === 'danger' ? '2' : '1';
}

export function MarineMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  /** Marker handles and their elements, keyed by spot id. */
  const markersRef = useRef(new Map<string, { marker: mapboxgl.Marker; el: HTMLElement }>());
  /** Ratings already fetched for the current level/hour, keyed by spot id. */
  const ratingsRef = useRef(new Map<string, Rating>());
  const fetchTokenRef = useRef(0);
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
  const [pending, setPending] = useState(0);

  /** Rebuilds the marker layer for the selected region. Cheap: no network. */
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current.clear();

    const visible = spots.filter(spot => spot.community === selectedRegion);

    for (const spot of visible) {
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
      el.style.transition = 'width 0.15s ease, height 0.15s ease';
      el.title = spot.name;

      const known = ratingsRef.current.get(spot.id);
      applyStyle(
        el,
        qualityStyle(known?.stars ?? 0, {
          isDangerous: known?.isDangerous,
          unrated: known?.unrated ?? true,
        }),
        known && !known.unrated ? known.stars : null
      );

      el.addEventListener('click', event => {
        event.stopPropagation();
        setSelectedSpot(spot.id);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([spot.coordinates.lon, spot.coordinates.lat])
        .addTo(map);
      markersRef.current.set(spot.id, { marker, el });
    }

    // Fly to the region whenever it changes: switching to Donegal from Cádiz
    // must take the user there, not leave them staring at an empty sea.
    const box = regionBounds(selectedRegion);
    if (box) {
      map.fitBounds(
        [
          [box.west, box.south],
          [box.east, box.north],
        ],
        { padding: 60, maxZoom: 9, duration: 900 }
      );
    }
  }, [selectedRegion, setSelectedSpot]);

  /** Scores only the spots currently on screen. */
  const fetchVisibleForecasts = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const token = ++fetchTokenRef.current;
    const bounds = map.getBounds();
    if (!bounds) return;

    const onScreen = spots
      .filter(spot => spot.community === selectedRegion)
      .filter(spot => bounds.contains([spot.coordinates.lon, spot.coordinates.lat]))
      .filter(spot => !ratingsRef.current.has(spot.id))
      .slice(0, MAX_SPOTS_PER_VIEWPORT);

    if (onScreen.length === 0) return;
    setPending(onScreen.length);

    await mapWithLimit(onScreen, MAX_CONCURRENT_FETCHES, async spot => {
      if (token !== fetchTokenRef.current) return;
      try {
        const res = await fetch(
          `/api/forecast?spotId=${spot.id}&level=${userSkillLevel}&hour=${currentHour}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.error || token !== fetchTokenRef.current) return;

        const rating: Rating = {
          stars: data.stars,
          unrated: data.unrated ?? false,
          isDangerous: data.safety?.isDangerous ?? false,
        };
        ratingsRef.current.set(spot.id, rating);

        const entry = markersRef.current.get(spot.id);
        if (entry) {
          applyStyle(
            entry.el,
            qualityStyle(rating.stars, {
              isDangerous: rating.isDangerous,
              unrated: rating.unrated,
            }),
            rating.unrated ? null : rating.stars
          );
        }
      } catch {
        // A single failed spot stays hollow; it must not stop the others.
      } finally {
        if (token === fetchTokenRef.current) setPending(p => Math.max(0, p - 1));
      }
    });

    if (token === fetchTokenRef.current) setPending(0);
  }, [selectedRegion, userSkillLevel, currentHour]);

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: userLocation ? [userLocation.lon, userLocation.lat] : SPAIN_CENTER,
      zoom: userLocation ? 8 : 5,
    });

    map.addControl(new mapboxgl.NavigationControl());
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
        // Refused or unavailable: the store's default region already applies.
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

  // Changing level or hour invalidates every score we hold.
  useEffect(() => {
    ratingsRef.current.clear();
  }, [userSkillLevel, currentHour]);

  useEffect(() => {
    if (!mapRef.current || loading) return;
    renderMarkers();
    fetchVisibleForecasts();
  }, [renderMarkers, fetchVisibleForecasts, loading]);

  // Panning and zooming bring new spots on screen; score those too.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    const onMoveEnd = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchVisibleForecasts(), MOVE_DEBOUNCE_MS);
    };

    map.on('moveend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchVisibleForecasts, loading]);

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
          <div className="text-white font-medium animate-pulse">Loading Marine Data...</div>
        </div>
      )}
      {!loading && pending > 0 && (
        <div
          data-testid="scoring-indicator"
          className="absolute top-6 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/85 backdrop-blur-md border border-zinc-800 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400"
        >
          Scoring {pending} spots…
        </div>
      )}
      <div ref={mapContainerRef} className="mapboxgl-map w-full h-full" />
    </div>
  );
}
