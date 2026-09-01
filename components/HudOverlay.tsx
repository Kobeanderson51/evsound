"use client";

import styles from "./HudOverlay.module.css";

type Props = {
  speed: number;
  rpm: number;
  gear: number;
  running: boolean;
  rpmPct: number;
  ecoScore: number;
  onClose: () => void;
};

export default function HudOverlay({ speed, rpm, gear, running, rpmPct, ecoScore, onClose }: Props) {
  return (
    <div className={styles.hudOverlay} onClick={onClose}>
      <button
        className={styles.hudExit}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        Exit HUD
      </button>
      <div className={styles.hudSpeed}>{Math.round(speed)}</div>
      <div className={styles.hudUnit}>MPH</div>
      <div className={styles.hudRpmRow}>
        <span className={styles.hudGear}>{speed < 1 && !running ? "P" : `G${gear}`}</span>
        <div className={styles.hudRpmBar}>
          <div
            className={styles.hudRpmFill}
            style={{ width: `${rpmPct}%`, background: rpmPct > 85 ? "var(--red)" : "var(--accent)" }}
          />
        </div>
        <span className={styles.hudRpmText}>{running ? `${Math.round(rpm)} RPM` : "— RPM"}</span>
      </div>
      <div className={styles.hudEco}>Eco {ecoScore}</div>
    </div>
  );
}
