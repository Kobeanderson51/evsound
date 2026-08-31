"use client";

import { useEffect, useRef, useState } from "react";

export type GpsQuality = "waiting" | "good" | "poor" | "denied" | "unavailable";

const MS_TO_MPH = 2.23694;

function haversineMeters(a: GeolocationCoordinates, b: GeolocationCoordinates) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Tracks vehicle speed via the Geolocation API.
 * Uses coords.speed when the device provides it (most phones and the Tesla
 * browser do); otherwise falls back to distance-over-time between fixes.
 */
export function useSpeed(enabled: boolean) {
  const [speedMph, setSpeedMph] = useState(0);
  const [quality, setQuality] = useState<GpsQuality>("waiting");
  const lastFix = useRef<{ coords: GeolocationCoordinates; time: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setQuality("unavailable");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { coords, timestamp } = pos;
        let mph: number | null = null;
        if (coords.speed !== null && !Number.isNaN(coords.speed)) {
          mph = Math.max(0, coords.speed * MS_TO_MPH);
        } else if (lastFix.current) {
          const dt = (timestamp - lastFix.current.time) / 1000;
          if (dt > 0.2) {
            const meters = haversineMeters(lastFix.current.coords, coords);
            mph = Math.max(0, (meters / dt) * MS_TO_MPH);
          }
        }
        lastFix.current = { coords, time: timestamp };
        if (mph !== null) setSpeedMph(mph < 1 ? 0 : mph);
        setQuality(coords.accuracy <= 25 ? "good" : "poor");
      },
      (err) => {
        setQuality(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 }
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      lastFix.current = null;
    };
  }, [enabled]);

  return { speedMph, quality };
}
