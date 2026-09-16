'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useStore } from '@/store/useStore';
import spots from '@/data/spots.json';
import { qualityColor } from '@/services/conditions';

const SPAIN_CENTER: [number, number] = [-6.5, 40.5];

export function MarineMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  /** Guards against a slow render overwriting a newer one. */
  const renderTokenRef = useRef(0);

  const {
    userLocation,
    setUserLocation,
    setSelectedSpot,
    userSkillLevel,
    currentHour,
    selectedRegion,
  } = useStore();
  const [loading, setLoading] = useState(true);

  const renderMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const token = ++renderTokenRef.current;

    // Remove via the Mapbox handles rather than scrubbing the DOM, so the map
    // keeps its own bookkeeping straight.
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const visible = spots.filter(
      spot => selectedRegion === 'all' || spot.community === selectedRegion
    );

    const results = await Promise.all(
      visible.map(async spot => {
        try {
          const res = await fetch(
            `/api/forecast?spotId=${spot.id}&level=${userSkillLevel}&hour=${currentHour}`
          );
          if (!res.ok) return null;
          const data = await res.json();
          if (data.error) return null;
          return { spot, data };
        } catch {
          return null;
        }
      })
    );

    if (token !== renderTokenRef.current) return; // a newer render started

    for (const result of results) {
      if (!result) continue;
      const { spot, data } = result;
      const isDangerous = data.safety?.isDangerous ?? false;

      const el = document.createElement('div');
      el.className = 'mapboxgl-marker custom-marker';
      el.dataset.testid = 'spot-marker';
      el.dataset.spotId = spot.id;
      el.dataset.stars = String(data.stars);
      el.dataset.dangerous = String(isDangerous);
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.borderRadius = '50%';
      el.style.cursor = 'pointer';
      el.style.transition = 'transform 0.15s ease';
      el.style.backgroundColor = qualityColor(data.stars, {
        isDangerous,
        unrated: data.unrated ?? false,
      });
      // Dangerous spots get a heavier ring so they stand out from the ramp.
      el.style.border = isDangerous ? '2px solid #FCA5A5' : '2px solid rgba(255,255,255,0.85)';

      el.addEventListener('click', event => {
        event.stopPropagation();
        setSelectedSpot(spot.id);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([spot.coordinates.lon, spot.coordinates.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [selectedRegion, userSkillLevel, currentHour, setSelectedSpot]);

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

    if (!userLocation && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setUserLocation(pos.coords.latitude, pos.coords.longitude);
          map.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 8 });
        },
        err => console.warn('Geolocation unavailable:', err.message)
      );
    }

    // With the style already in the browser cache the map can finish loading
    // before this listener is attached, and the event is then missed for good:
    // the overlay stays up and no markers are ever drawn. Check the state
    // first, and keep `idle` as a safety net.
    const onReady = () => setLoading(false);
    if (map.loaded()) {
      onReady();
    } else {
      map.once('load', onReady);
      map.once('idle', onReady);
    }

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // Mount-only: re-running would tear down the map on every store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapRef.current && !loading) renderMarkers();
  }, [renderMarkers, loading]);

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
          <div className="text-white font-medium animate-pulse">Loading Marine Data...</div>
        </div>
      )}
      <div ref={mapContainerRef} className="mapboxgl-map w-full h-full" />
    </div>
  );
}
