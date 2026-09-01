"use client";

import styles from "./Controls.module.css";

type Props = {
  running: boolean;
  isRecording: boolean;
  recordUrl: string | null;
  recordExt: string;
  onStart: () => void;
  onStop: () => void;
  onRevDown: () => void;
  onRevCancel: () => void;
  onLaunch: () => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
};

export default function Controls({
  running,
  isRecording,
  recordUrl,
  recordExt,
  onStart,
  onStop,
  onRevDown,
  onRevCancel,
  onLaunch,
  onStartRecord,
  onStopRecord,
}: Props) {
  return (
    <>
      <section className={styles.controls}>
        <button
          className={`${styles.bigBtn} ${running ? styles.stopBtn : styles.startBtn}`}
          onClick={running ? onStop : onStart}
        >
          {running ? "STOP" : "START"}
        </button>
        <button
          className={`${styles.bigBtn} ${styles.revBtn}`}
          disabled={!running}
          onPointerDown={onRevDown}
          onPointerUp={onRevCancel}
          onPointerLeave={onRevCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          HOLD TO REV
        </button>
        <button
          className={`${styles.bigBtn} ${styles.launchBtn}`}
          disabled={!running}
          onClick={onLaunch}
        >
          LAUNCH
        </button>
        <button
          className={`${styles.bigBtn} ${isRecording ? styles.stopBtn : styles.recordBtn}`}
          disabled={!running}
          onClick={isRecording ? onStopRecord : onStartRecord}
        >
          {isRecording ? "STOP REC" : "RECORD"}
        </button>
      </section>

      {recordUrl && (
        <a
          href={recordUrl}
          download={`evsound-${Date.now()}.${recordExt}`}
          className={styles.recordLink}
        >
          Download recording
        </a>
      )}
    </>
  );
}
