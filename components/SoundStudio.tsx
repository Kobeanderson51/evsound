"use client";

import styles from "./SoundStudio.module.css";
import type { FxProfile, FxLayer } from "@/lib/audio/profiles";

type Props = {
  profile: FxProfile;
  onChange: (p: FxProfile) => void;
  onTest: () => void;
};

const OSCS: FxLayer["osc"][] = ["sine", "saw", "tri", "square", "noise"];
const FILTERS: NonNullable<FxLayer["filter"]>["type"][] = ["lp", "bp", "hp"];

export default function SoundStudio({ profile, onChange, onTest }: Props) {

  const setLayer = (i: number, patch: Partial<FxLayer>) => {
    const layers = profile.params.layers.map((l, idx) =>
      idx === i ? ({ ...l, ...patch } as FxLayer) : l
    );
    onChange({ ...profile, params: { ...profile.params, layers } });
  };

  const setFilter = (
    i: number,
    patch: Partial<NonNullable<FxLayer["filter"]>>
  ) => {
    const layer = profile.params.layers[i];
    const current = layer.filter ?? { type: "lp", f0: 200, f1: 2000, q: 1 };
    setLayer(i, { filter: { ...current, ...patch } as FxLayer["filter"] });
  };

  const addLayer = () => {
    if (profile.params.layers.length >= 8) return;
    const newLayer: FxLayer = {
      osc: "sine",
      f0: 100,
      f1: 400,
      g0: 0.1,
      g1: 0.1,
      filter: { type: "lp", f0: 200, f1: 2000, q: 1 },
    };
    onChange({
      ...profile,
      params: { ...profile.params, layers: [...profile.params.layers, newLayer] },
    });
  };

  const removeLayer = (i: number) => {
    const layers = profile.params.layers.filter((_, idx) => idx !== i);
    onChange({ ...profile, params: { ...profile.params, layers } });
  };

  return (
    <section className={styles.studio}>
      <div className={styles.studioHeader}>
        <h2 className={styles.studioTitle}>Sound Studio</h2>
        <button className={styles.testBtn} onClick={onTest}>
          Test
        </button>
      </div>

      <div className={styles.metaRow}>
        <label className={styles.field}>
          Name
          <input
            value={profile.name}
            onChange={(e) => onChange({ ...profile, name: e.target.value })}
            className={styles.textInput}
          />
        </label>
        <label className={styles.field}>
          Emoji
          <input
            value={profile.emoji}
            onChange={(e) => onChange({ ...profile, emoji: e.target.value })}
            className={styles.textInput}
          />
        </label>
        <label className={styles.field}>
          Base gain
          <input
            type="number"
            step={0.05}
            min={0}
            max={2}
            value={profile.baseGain}
            onChange={(e) => onChange({ ...profile, baseGain: Number(e.target.value) })}
            className={styles.textInput}
          />
        </label>
      </div>

      <div className={styles.layers}>
        {profile.params.layers.map((layer, i) => (
          <div key={i} className={styles.layer}>
            <div className={styles.layerHeader}>
              <span>Layer {i + 1}</span>
              <button className={styles.removeBtn} onClick={() => removeLayer(i)}>
                Remove
              </button>
            </div>

            <div className={styles.row}>
              <label className={styles.field}>
                Wave
                <select
                  value={layer.osc}
                  onChange={(e) => setLayer(i, { osc: e.target.value as FxLayer["osc"] })}
                  className={styles.select}
                >
                  {OSCS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>

              {layer.osc !== "noise" && (
                <>
                  <label className={styles.field}>
                    f0
                    <input
                      type="number"
                      min={20}
                      max={20000}
                      value={layer.f0 ?? 0}
                      onChange={(e) => setLayer(i, { f0: Number(e.target.value) })}
                      className={styles.textInput}
                    />
                  </label>
                  <label className={styles.field}>
                    f1
                    <input
                      type="number"
                      min={20}
                      max={20000}
                      value={layer.f1 ?? 0}
                      onChange={(e) => setLayer(i, { f1: Number(e.target.value) })}
                      className={styles.textInput}
                    />
                  </label>
                </>
              )}
            </div>

            <div className={styles.row}>
              <label className={styles.field}>
                Filter
                <select
                  value={layer.filter?.type ?? "lp"}
                  onChange={(e) =>
                    setFilter(i, { type: e.target.value as (typeof FILTERS)[number] })
                  }
                  className={styles.select}
                >
                  {FILTERS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                f0
                <input
                  type="number"
                  value={layer.filter?.f0 ?? 200}
                  onChange={(e) => setFilter(i, { f0: Number(e.target.value) })}
                  className={styles.textInput}
                />
              </label>
              <label className={styles.field}>
                f1
                <input
                  type="number"
                  value={layer.filter?.f1 ?? 2000}
                  onChange={(e) => setFilter(i, { f1: Number(e.target.value) })}
                  className={styles.textInput}
                />
              </label>
              <label className={styles.field}>
                Q
                <input
                  type="number"
                  step={0.1}
                  value={layer.filter?.q ?? 1}
                  onChange={(e) => setFilter(i, { q: Number(e.target.value) })}
                  className={styles.textInput}
                />
              </label>
            </div>

            <div className={styles.row}>
              <label className={styles.field}>
                gain start
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={2}
                  value={layer.g0}
                  onChange={(e) => setLayer(i, { g0: Number(e.target.value) })}
                  className={styles.textInput}
                />
              </label>
              <label className={styles.field}>
                gain end
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={2}
                  value={layer.g1}
                  onChange={(e) => setLayer(i, { g1: Number(e.target.value) })}
                  className={styles.textInput}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button className={styles.addBtn} onClick={addLayer}>
        + Add layer
      </button>
    </section>
  );
}
