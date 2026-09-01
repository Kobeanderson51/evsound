import { useEffect, useRef, useState } from "react";
import type { EngineAudio } from "./audio/engine";
import type { Drivetrain, ShiftStyle } from "./drivetrain";
import type { SoundProfile } from "./audio/profiles";

type UseEngineLoopOptions = {
  running: boolean;
  audioRef: React.MutableRefObject<EngineAudio | null>;
  trainRef: React.MutableRefObject<Drivetrain>;
  profileRef: React.MutableRefObject<SoundProfile>;
  settingsRef: React.MutableRefObject<{ maxSpeed: number; shiftStyle: ShiftStyle; response: number }>;
  speedRef: React.MutableRefObject<number>;
  revHeld: React.MutableRefObject<boolean>;
  motionThrottleRef: React.MutableRefObject<number>;
  manualMode: boolean;
};

export function useEngineLoop({
  running,
  audioRef,
  trainRef,
  profileRef,
  settingsRef,
  speedRef,
  revHeld,
  motionThrottleRef,
  manualMode,
}: UseEngineLoopOptions) {
  const [display, setDisplay] = useState({ rpm: 0, gear: 1, speed: 0 });
  const [ecoScore, setEcoScore] = useState(100);
  const ecoScoreRef = useRef(100);
  const lastEcoSpeedRef = useRef(0);
  const lastEcoTimeRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const p = profileRef.current;
      const s = settingsRef.current;
      const state = trainRef.current.tick(speedRef.current, dt, revHeld.current, {
        idleRpm: p.idleRpm,
        redlineRpm: p.redlineRpm,
        maxSpeed: s.maxSpeed,
        shiftStyle: s.shiftStyle,
        response: s.response,
        motionThrottle: motionThrottleRef.current,
        manual: manualMode,
      });
      audioRef.current?.update(state.rpm, state.throttle, state.gear, revHeld.current);
      const speed = speedRef.current;
      if (lastEcoTimeRef.current === 0) {
        lastEcoSpeedRef.current = speed;
        lastEcoTimeRef.current = now;
      } else if (speed !== lastEcoSpeedRef.current) {
        const speedDelta = speed - lastEcoSpeedRef.current;
        const timeDelta = (now - lastEcoTimeRef.current) / 1000;
        if (timeDelta > 0.05) {
          const accel = speedDelta / timeDelta;
          const target = Math.max(0, 100 - Math.min(Math.abs(accel) * 8, 80));
          ecoScoreRef.current = ecoScoreRef.current * 0.95 + target * 0.05;
          lastEcoSpeedRef.current = speed;
          lastEcoTimeRef.current = now;
        }
      }
      if (now - lastUi > 100) {
        lastUi = now;
        setDisplay({ rpm: state.rpm, gear: state.gear, speed });
        setEcoScore(Math.round(ecoScoreRef.current));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, manualMode, audioRef, trainRef, profileRef, settingsRef, speedRef, revHeld, motionThrottleRef]);

  return { display, ecoScore };
}
