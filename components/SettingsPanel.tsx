"use client";

import styles from "@/app/page.module.css";
import { type ShiftStyle } from "@/lib/drivetrain";

type Props = {
  volume: number;
  setVolume: (v: number) => void;
  maxSpeed: number;
  setMaxSpeed: (v: number) => void;
  response: number;
  setResponse: (v: number) => void;
  shiftStyle: ShiftStyle;
  setShiftStyle: (s: ShiftStyle) => void;
  exteriorBoost: boolean;
  setExteriorBoost: (v: boolean) => void;
  stabilityMode: boolean;
  setStabilityMode: (v: boolean) => void;
  motionAssist: boolean;
  setMotionAssist: (v: boolean) => void;
  motionAvailable: boolean;
  motionSensitivity: number;
  setMotionSensitivity: (v: number) => void;
  manualMode: boolean;
  setManualMode: (v: boolean) => void;
  manualGear: number;
  setManualGear: (v: number) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  demoSpeed: number;
  setDemoSpeed: (v: number) => void;
};

export default function SettingsPanel({
  volume,
  setVolume,
  maxSpeed,
  setMaxSpeed,
  response,
  setResponse,
  shiftStyle,
  setShiftStyle,
  exteriorBoost,
  setExteriorBoost,
  stabilityMode,
  setStabilityMode,
  motionAssist,
  setMotionAssist,
  motionAvailable,
  motionSensitivity,
  setMotionSensitivity,
  manualMode,
  setManualMode,
  manualGear,
  setManualGear,
  theme,
  setTheme,
  demoMode,
  setDemoMode,
  demoSpeed,
  setDemoSpeed,
}: Props) {
  return (
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
          checked={manualMode}
          onChange={(e) => setManualMode(e.target.checked)}
        />
        <span>Manual / paddle shift mode</span>
      </label>
      {manualMode && (
        <div className={styles.setting}>
          <span>Manual gear</span>
          <div className={styles.segmented}>
            {([1, 2, 3, 4, 5, 6] as const).map((g) => (
              <button
                key={g}
                className={`${styles.segBtn} ${manualGear === g ? styles.segBtnActive : ""}`}
                onClick={() => setManualGear(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
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
  );
}
