"use client";

import styles from "./TuningPanel.module.css";
import type { SoundProfile, EngineProfile, EngineParams } from "@/lib/audio/profiles";

type Props = {
  profile: SoundProfile;
  onChange: (p: SoundProfile) => void;
};

const DEFAULT_TURBO = {
  level: 0,
  noise: 0.2,
  hz: [3000, 6000] as [number, number],
  bov: 0.4,
  flutterHz: 12,
  flutterDepth: 0.5,
};

const DEFAULT_INTAKE = { level: 0, hz: 300, q: 1 };
const DEFAULT_SUPERCHARGER = { ratio: 0.2, level: 0 };
const DEFAULT_RASP = { level: 0, hz: [300, 1000] as [number, number], loadPow: 1, knee: 0.4 };

function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className={styles.field}>
      <span>
        {label} — {value.toFixed(2)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function TuningPanel({ profile, onChange }: Props) {
  const isEngine = profile.kind === "engine";
  const engine = isEngine ? (profile as EngineProfile) : null;

  const setBaseGain = (baseGain: number) => onChange({ ...profile, baseGain });

  const setEngine = (patch: Partial<EngineParams>) => {
    if (!engine) return;
    onChange({ ...engine, params: { ...engine.params, ...patch } });
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Live Tuning — {profile.name}</h2>

      <Slider label="Base gain" value={profile.baseGain} max={2} step={0.01} onChange={setBaseGain} />

      {isEngine && engine && (
        <div className={styles.rows}>
          <Slider
            label="Crackle"
            value={engine.params.crackle ?? 0}
            onChange={(v) => setEngine({ crackle: v })}
          />
          <Slider
            label="Noise mix"
            value={engine.params.noiseMix ?? 0}
            onChange={(v) => setEngine({ noiseMix: v })}
          />
          <Slider
            label="Sub gain"
            value={engine.params.subGain ?? 0}
            onChange={(v) => setEngine({ subGain: v })}
          />
          <Slider
            label="Thump gain"
            value={engine.params.thumpGain ?? 0}
            onChange={(v) => setEngine({ thumpGain: v })}
          />
          <Slider
            label="Intake level"
            value={engine.params.intake?.level ?? 0}
            onChange={(v) =>
              setEngine({ intake: { ...(engine.params.intake ?? DEFAULT_INTAKE), level: v } })
            }
          />
          <Slider
            label="Turbo level"
            value={engine.params.turbo?.level ?? 0}
            onChange={(v) =>
              setEngine({ turbo: { ...(engine.params.turbo ?? DEFAULT_TURBO), level: v } })
            }
          />
          <Slider
            label="Supercharger level"
            value={engine.params.supercharger?.level ?? 0}
            onChange={(v) =>
              setEngine({
                supercharger: { ...(engine.params.supercharger ?? DEFAULT_SUPERCHARGER), level: v },
              })
            }
          />
          <Slider
            label="Rasp level"
            value={engine.params.rasp?.level ?? 0}
            onChange={(v) =>
              setEngine({ rasp: { ...(engine.params.rasp ?? DEFAULT_RASP), level: v } })
            }
          />
        </div>
      )}

      {!isEngine && <p className={styles.hint}>Only engine profiles support live parameter tuning right now.</p>}
    </section>
  );
}
