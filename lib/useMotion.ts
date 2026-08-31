"use client";

import { useEffect, useRef, useState } from "react";

type DeviceMotionEventCtor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/**
 * Motion assist: uses the device accelerometer (phone/tablet only) for quicker
 * throttle and lift-off cues between GPS fixes. GPS remains the primary speed
 * source. Returns a ref holding an extra throttle amount 0..1.
 */
export function useMotion(enabled: boolean, sensitivity: number) {
  const throttleRef = useRef(0);
  const [available, setAvailable] = useState(true);
  const sensRef = useRef(sensitivity);
  sensRef.current = sensitivity;

  useEffect(() => {
    if (!enabled) {
      throttleRef.current = 0;
      return;
    }
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setAvailable(false);
      return;
    }
    let smoothed = 0;
    let attached = false;
    const handler = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (!a || (a.x === null && a.y === null && a.z === null)) return;
      const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      smoothed += (mag - smoothed) * 0.15;
      const s = sensRef.current;
      // Deadzone filters road bumps; higher sensitivity = smaller deadzone
      const deadzone = 1.6 - s * 1.1;
      throttleRef.current = Math.min(0.6, Math.max(0, (smoothed - deadzone) * (0.15 + s * 0.25)));
    };
    const attach = () => {
      window.addEventListener("devicemotion", handler);
      attached = true;
    };
    const DM = DeviceMotionEvent as DeviceMotionEventCtor;
    if (typeof DM.requestPermission === "function") {
      DM.requestPermission()
        .then((state) => (state === "granted" ? attach() : setAvailable(false)))
        .catch(() => setAvailable(false));
    } else {
      attach();
    }
    return () => {
      if (attached) window.removeEventListener("devicemotion", handler);
      throttleRef.current = 0;
    };
  }, [enabled]);

  return { throttleRef, available };
}
