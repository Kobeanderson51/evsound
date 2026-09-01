"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import styles from "./page.module.css";
import { PROFILES, type SoundProfile, type FxProfile } from "@/lib/audio/profiles";
import { EngineAudio } from "@/lib/audio/engine";
import { Drivetrain, type ShiftStyle } from "@/lib/drivetrain";
import { useSpeed } from "@/lib/useSpeed";
import { useMotion } from "@/lib/useMotion";
import SoundStudio from "@/components/SoundStudio";
import TuningPanel from "@/components/TuningPanel";
import HudOverlay from "@/components/HudOverlay";
import Controls from "@/components/Controls";
import SettingsPanel from "@/components/SettingsPanel";

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
  const [ecoScore, setEcoScore] = useState(100);
  const [showStudio, setShowStudio] = useState(false);
  const [showTuning, setShowTuning] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [manualMode, setManualMode] = useState(false);
  const [manualGear, setManualGear] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState<string | null>(null);
  const [recordExt, setRecordExt] = useState("webm");
  const [hudMode, setHudMode] = useState(false);
  const [customProfile, setCustomProfile] = useState<FxProfile>(() => {
    if (typeof window === "undefined") return cloneDefaultCustom();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as FxProfile) : cloneDefaultCustom();
    } catch {
      return cloneDefaultCustom();
    }
  });
  const [tunedProfile, setTunedProfile] = useState<SoundProfile | null>(null);

  const allProfiles = useMemo(() => {
    const base = [...PROFILES];
    if (tunedProfile && profileId !== customProfile.id) {
      const idx = base.findIndex((p) => p.id === profileId);
      if (idx !== -1) base[idx] = tunedProfile;
    }
    return [...base, customProfile];
  }, [tunedProfile, customProfile, profileId]);

  useEffect(() => {
    const src =
      profileId === customProfile.id
        ? customProfile
        : (PROFILES.find((p) => p.id === profileId) ?? PROFILES[0]);
    setTunedProfile(JSON.parse(JSON.stringify(src)) as SoundProfile);
  }, [profileId, customProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customProfile));
    } catch {}
  }, [customProfile]);

  const audioRef = useRef<EngineAudio | null>(null);
  const trainRef = useRef(new Drivetrain());
  const revHeld = useRef(false);
  const ecoScoreRef = useRef(100);
  const lastEcoSpeedRef = useRef(0);
  const lastEcoTimeRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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

  const startRecording = useCallback(() => {
    const stream = audioRef.current?.getStream();
    if (!stream) return;
    chunksRef.current = [];
    setRecordExt("webm");
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const ext = recorder.mimeType.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      setRecordExt(ext);
      setRecordUrl(url);
      setIsRecording(false);
    };
    recorder.onerror = () => setIsRecording(false);
    recorder.start(100);
    recorderRef.current = recorder;
    setRecordUrl(null);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  // Restart the voice when the sound is changed while running
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => audioRef.current?.start(profile), 150);
    return () => clearTimeout(t);
  }, [profile, running]);

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

  useEffect(() => {
    trainRef.current.setManual(manualMode);
    if (manualMode) trainRef.current.setGear(manualGear);
  }, [manualMode, manualGear]);

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

  if (hudMode) {
    return (
      <HudOverlay
        speed={display.speed}
        rpm={display.rpm}
        gear={display.gear}
        running={running}
        rpmPct={rpmPct}
        ecoScore={ecoScore}
        onClose={() => setHudMode(false)}
      />
    );
  }

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
        <div className={styles.ecoRow}>
          <span className={styles.ecoLabel}>Eco</span>
          <div className={styles.ecoBar}>
            <div
              className={styles.ecoFill}
              style={{
                width: `${ecoScore}%`,
                background: ecoScore > 70 ? "var(--green)" : ecoScore > 40 ? "var(--accent)" : "var(--red)",
              }}
            />
          </div>
          <span className={styles.ecoText}>{ecoScore}</span>
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

      <Controls
        running={running}
        isRecording={isRecording}
        recordUrl={recordUrl}
        recordExt={recordExt}
        onStart={start}
        onStop={stop}
        onRevDown={() => (revHeld.current = true)}
        onRevCancel={() => (revHeld.current = false)}
        onLaunch={() => {
          revHeld.current = true;
          setTimeout(() => {
            revHeld.current = false;
          }, 2500);
        }}
        onStartRecord={startRecording}
        onStopRecord={stopRecording}
      />

      <button className={styles.settingsToggle} onClick={() => setHudMode(true)}>
        Open HUD ▣
      </button>

      <button className={styles.settingsToggle} onClick={() => setShowSettings((s) => !s)}>
        Settings {showSettings ? "▴" : "▾"}
      </button>

      <button className={styles.settingsToggle} onClick={() => setShowStudio((s) => !s)}>
        Sound Studio {showStudio ? "▴" : "▾"}
      </button>

      <button className={styles.settingsToggle} onClick={() => setShowTuning((s) => !s)}>
        Live Tuning {showTuning ? "▴" : "▾"}
      </button>

      {showSettings && (
        <SettingsPanel
          volume={volume}
          setVolume={setVolume}
          maxSpeed={maxSpeed}
          setMaxSpeed={setMaxSpeed}
          response={response}
          setResponse={setResponse}
          shiftStyle={shiftStyle}
          setShiftStyle={setShiftStyle}
          exteriorBoost={exteriorBoost}
          setExteriorBoost={setExteriorBoost}
          stabilityMode={stabilityMode}
          setStabilityMode={setStabilityMode}
          motionAssist={motionAssist}
          setMotionAssist={setMotionAssist}
          motionAvailable={motionAvailable}
          motionSensitivity={motionSensitivity}
          setMotionSensitivity={setMotionSensitivity}
          manualMode={manualMode}
          setManualMode={setManualMode}
          manualGear={manualGear}
          setManualGear={setManualGear}
          theme={theme}
          setTheme={setTheme}
          demoMode={demoMode}
          setDemoMode={setDemoMode}
          demoSpeed={demoSpeed}
          setDemoSpeed={setDemoSpeed}
        />
      )}

      {showStudio && (
        <SoundStudio
          profile={customProfile}
          onChange={setCustomProfile}
          onTest={() => setProfileId(customProfile.id)}
        />
      )}

      {showTuning && <TuningPanel profile={profile} onChange={setTunedProfile} />}

      <footer className={styles.footer}>
        Keep this tab active while driving — browsers pause audio when fully backgrounded.
      </footer>
    </main>
  );
}
