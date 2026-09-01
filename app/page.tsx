"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import styles from "./page.module.css";
import { PROFILES, type SoundProfile, type FxProfile } from "@/lib/audio/profiles";
import { EngineAudio } from "@/lib/audio/engine";
import { Drivetrain, type ShiftStyle } from "@/lib/drivetrain";
import { useSpeed } from "@/lib/useSpeed";
import { useMotion } from "@/lib/useMotion";
import SoundStudio from "@/components/SoundStudio";

const STORAGE_KEY = "evsound-custom-profile";
const SETTINGS_KEY = "evsound-settings";

function makeFallbackCustom(): FxProfile {
  return {
    kind: "fx",
    id: "__custom__",
    name: "My Custom Sound",
    emoji: "🎛️",
    idleRpm: 400,
    redlineRpm: 12000,
    baseGain: 0.8,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "sine", f0: 120, f1: 320, g0: 0.25, g1: 0.25, filter: { type: "lp", f0: 300, f1: 2400, q: 1.2 } },
        { osc: "saw", f0: 220, f1: 620, g0: 0.08, g1: 0.12, filter: { type: "bp", f0: 600, f1: 1800, q: 2 } },
      ],
    },
  };
}

function cloneDefaultCustom(): FxProfile {
  const etron = PROFILES.find((p): p is FxProfile => p.kind === "fx" && p.id === "etron");
  const base = etron ? (JSON.parse(JSON.stringify(etron)) as FxProfile) : makeFallbackCustom();
  base.id = "__custom__";
  base.name = "My Custom Sound";
  base.emoji = "🎛️";
  return base;
}

const GPS_LABEL: Record<string, string> = {
  waiting: "Waiting for GPS…",
  good: "GPS: good",
  poor: "GPS: weak signal",
  denied: "GPS: permission denied",
  unavailable: "GPS: unavailable",
};

export default function Home() {
  const [running, setRunning] = useState(false);
  const [profileId, setProfileId] = useState(PROFILES[0].id);
  const [volume, setVolume] = useState(0.8);
  const [maxSpeed, setMaxSpeed] = useState(70);
  const [response, setResponse] = useState(0.5);
  const [shiftStyle, setShiftStyle] = useState<ShiftStyle>("medium");
  const [exteriorBoost, setExteriorBoost] = useState(false);
  const [stabilityMode, setStabilityMode] = useState(false);
  const [motionAssist, setMotionAssist] = useState(false);
  const [motionSensitivity, setMotionSensitivity] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoSpeed, setDemoSpeed] = useState(0);
  const [display, setDisplay] = useState({ rpm: 0, gear: 1, speed: 0 });
  const [showStudio, setShowStudio] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [customProfile, setCustomProfile] = useState<FxProfile>(() => {
    if (typeof window === "undefined") return cloneDefaultCustom();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as FxProfile) : cloneDefaultCustom();
    } catch {
      return cloneDefaultCustom();
    }
  });

  const allProfiles = useMemo(() => [...PROFILES, customProfile], [customProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customProfile));
    } catch {}
  }, [customProfile]);

  const audioRef = useRef<EngineAudio | null>(null);
  const trainRef = useRef(new Drivetrain());
  const revHeld = useRef(false);
  const settingsRef = useRef({ maxSpeed, shiftStyle, response });
  settingsRef.current = { maxSpeed, shiftStyle, response };

  const { speedMph: gpsSpeed, quality } = useSpeed(running && !demoMode);
  const { throttleRef: motionThrottleRef, available: motionAvailable } = useMotion(
    running && motionAssist,
    motionSensitivity
  );
  const speedRef = useRef(0);
  speedRef.current = demoMode ? demoSpeed : gpsSpeed;

  const profile: SoundProfile = allProfiles.find((p) => p.id === profileId) ?? allProfiles[0];
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const start = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new EngineAudio();
    audioRef.current.setVolume(volume);
    trainRef.current.reset(profileRef.current.idleRpm);
    await audioRef.current.start(profileRef.current);
    (window as unknown as Record<string, unknown>).__EVFX_AUDIO = audioRef.current;
    setRunning(true);
  }, [volume]);

  const stop = useCallback(() => {
    audioRef.current?.stop();
    setRunning(false);
  }, []);

  // Restart the voice when the sound is changed while running
  useEffect(() => {
    if (running) audioRef.current?.start(profile);
  }, [profile]);

  useEffect(() => {
    audioRef.current?.setVolume(volume);
  }, [volume]);

  // Expose profiles for automated audio tests
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__EVFX_PROFILES = PROFILES;
  }, []);

  // Restore settings from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.profileId && typeof s.profileId === "string") setProfileId(s.profileId);
      if (typeof s.volume === "number") setVolume(s.volume);
      if (typeof s.maxSpeed === "number") setMaxSpeed(s.maxSpeed);
      if (typeof s.response === "number") setResponse(s.response);
      if (["relaxed", "medium", "sport"].includes(s.shiftStyle)) setShiftStyle(s.shiftStyle);
      if (typeof s.exteriorBoost === "boolean") setExteriorBoost(s.exteriorBoost);
      if (typeof s.stabilityMode === "boolean") setStabilityMode(s.stabilityMode);
      if (typeof s.motionAssist === "boolean") setMotionAssist(s.motionAssist);
      if (typeof s.motionSensitivity === "number") setMotionSensitivity(s.motionSensitivity);
      if (["dark", "light"].includes(s.theme)) setTheme(s.theme as "dark" | "light");
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Save settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          profileId,
          volume,
          maxSpeed,
          response,
          shiftStyle,
          exteriorBoost,
          stabilityMode,
          motionAssist,
          motionSensitivity,
          theme,
        })
      );
    } catch {}
  }, [
    profileId,
    volume,
    maxSpeed,
    response,
    shiftStyle,
    exteriorBoost,
    stabilityMode,
    motionAssist,
    motionSensitivity,
    theme,
  ]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.exteriorBoost = exteriorBoost;
      audioRef.current.stabilityMode = stabilityMode;
    }
  }, [exteriorBoost, stabilityMode, running]);

  // Main loop
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
      });
      audioRef.current?.update(state.rpm, state.throttle, state.gear, revHeld.current);
      if (now - lastUi > 100) {
        lastUi = now;
        setDisplay({ rpm: state.rpm, gear: state.gear, speed: speedRef.current });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  // Keep the screen awake while running
  useEffect(() => {
    if (!running || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [running]);

  const rpmPct = Math.min(
    100,
    Math.max(0, ((display.rpm - 0) / profile.redlineRpm) * 100)
  );

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>⚡ EV Sound FX</h1>
        <span className={`${styles.gps} ${quality === "good" ? styles.gpsGood : ""}`}>
          {demoMode ? "Demo mode" : GPS_LABEL[quality]}
        </span>
      </header>

      <section className={styles.dash}>
        <div className={styles.speedo}>
          <span className={styles.speedValue}>{Math.round(display.speed)}</span>
          <span className={styles.speedUnit}>MPH</span>
        </div>
        <div className={styles.rpmRow}>
          <span className={styles.gear}>{display.speed < 1 && !running ? "P" : `G${display.gear}`}</span>
          <div className={styles.rpmBar}>
            <div
              className={styles.rpmFill}
              style={{ width: `${rpmPct}%`, background: rpmPct > 85 ? "var(--red)" : "var(--accent)" }}
            />
          </div>
          <span className={styles.rpmText}>{running ? `${Math.round(display.rpm)} RPM` : "— RPM"}</span>
        </div>
      </section>

      <section className={styles.sounds}>
        {allProfiles.map((p) => (
          <button
            key={p.id}
            className={`${styles.soundChip} ${p.id === profileId ? styles.soundChipActive : ""}`}
            onClick={() => setProfileId(p.id)}
          >
            <span className={styles.soundEmoji}>{p.emoji}</span>
            {p.name}
          </button>
        ))}
      </section>

      <section className={styles.controls}>
        <button
          className={`${styles.bigBtn} ${running ? styles.stopBtn : styles.startBtn}`}
          onClick={running ? stop : start}
        >
          {running ? "STOP" : "START"}
        </button>
        <button
          className={`${styles.bigBtn} ${styles.revBtn}`}
          disabled={!running}
          onPointerDown={() => (revHeld.current = true)}
          onPointerUp={() => (revHeld.current = false)}
          onPointerLeave={() => (revHeld.current = false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          HOLD TO REV
        </button>
      </section>

      <button className={styles.settingsToggle} onClick={() => setShowSettings((s) => !s)}>
        Settings {showSettings ? "▴" : "▾"}
      </button>

      <button className={styles.settingsToggle} onClick={() => setShowStudio((s) => !s)}>
        Sound Studio {showStudio ? "▴" : "▾"}
      </button>

      {showSettings && (
        <section className={styles.settings}>
          <label className={styles.setting}>
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </label>

          <label className={styles.setting}>
            <span>Max speed — {maxSpeed} mph</span>
            <input
              type="range"
              min={30}
              max={130}
              step={5}
              value={maxSpeed}
              onChange={(e) => setMaxSpeed(Number(e.target.value))}
            />
          </label>

          <label className={styles.setting}>
            <span>Response — {response < 0.34 ? "Smoother" : response > 0.66 ? "Faster" : "Balanced"}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={response}
              onChange={(e) => setResponse(Number(e.target.value))}
            />
          </label>

          <div className={styles.setting}>
            <span>Shift style</span>
            <div className={styles.segmented}>
              {(["relaxed", "medium", "sport"] as ShiftStyle[]).map((s) => (
                <button
                  key={s}
                  className={`${styles.segBtn} ${shiftStyle === s ? styles.segBtnActive : ""}`}
                  onClick={() => setShiftStyle(s)}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.settingRow}>
            <input
              type="checkbox"
              checked={exteriorBoost}
              onChange={(e) => setExteriorBoost(e.target.checked)}
            />
            <span>Exterior Boost — loud at idle, for outside/Bluetooth speakers</span>
          </label>

          <label className={styles.settingRow}>
            <input
              type="checkbox"
              checked={stabilityMode}
              onChange={(e) => setStabilityMode(e.target.checked)}
            />
            <span>Audio Stability Mode — extra buffering for devices that crackle</span>
          </label>

          <label className={styles.settingRow}>
            <input
              type="checkbox"
              checked={motionAssist}
              onChange={(e) => setMotionAssist(e.target.checked)}
            />
            <span>
              Motion assist — quicker throttle cues from phone/tablet motion
              {!motionAvailable && motionAssist ? " (not available on this device)" : ""}
            </span>
          </label>
          {motionAssist && (
            <label className={styles.setting}>
              <span>
                Motion sensitivity —{" "}
                {motionSensitivity < 0.34 ? "Low" : motionSensitivity > 0.66 ? "High" : "Balanced"}.
                If bumps trigger false revs, lower this. GPS remains the primary speed source.
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={motionSensitivity}
                onChange={(e) => setMotionSensitivity(Number(e.target.value))}
              />
            </label>
          )}

          <label className={styles.settingRow}>
            <input
              type="checkbox"
              checked={theme === "light"}
              onChange={(e) => setTheme(e.target.checked ? "light" : "dark")}
            />
            <span>Light mode</span>
          </label>

          <label className={styles.settingRow}>
            <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} />
            <span>Demo mode (simulate speed without GPS)</span>
          </label>
          {demoMode && (
            <label className={styles.setting}>
              <span>Demo speed — {demoSpeed} mph</span>
              <input
                type="range"
                min={0}
                max={130}
                step={1}
                value={demoSpeed}
                onChange={(e) => setDemoSpeed(Number(e.target.value))}
              />
            </label>
          )}
        </section>
      )}

      {showStudio && (
        <SoundStudio
          profile={customProfile}
          onChange={setCustomProfile}
          onTest={() => setProfileId(customProfile.id)}
        />
      )}

      <footer className={styles.footer}>
        Keep this tab active while driving — browsers pause audio when fully backgrounded.
      </footer>
    </main>
  );
}
