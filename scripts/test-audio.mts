/*
 * Offline audio test harness — runs the AudioWorklet engine in Node.
 *
 * For every profile it simulates: idle -> full-throttle pull to near-redline
 * -> hard lift-off, and asserts the output is finite, audible, pitch-tracks
 * RPM, gets louder under throttle, and fires the lift-off effects (blow-off,
 * overrun crackle, hiss).
 *
 * Run: node scripts/test-audio.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROFILES } from "../lib/audio/profiles.ts";
import { Drivetrain } from "../lib/drivetrain.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FS = 48000;
const BLOCK = 128;

// ---- shim the AudioWorklet global scope and load the processor ----
const g = globalThis as Record<string, unknown>;
g.sampleRate = FS;
g.AudioWorkletProcessor = class {
  port = { postMessage() {} };
};
let ProcessorClass: new (opts: { processorOptions: unknown }) => {
  process(i: unknown, o: Float32Array[][], p: Record<string, Float32Array>): boolean;
  [key: string]: unknown;
};
g.registerProcessor = (_name: string, cls: typeof ProcessorClass) => {
  ProcessorClass = cls;
};
// eslint-disable-next-line no-eval
(0, eval)(readFileSync(join(__dirname, "../public/engine-worklet.js"), "utf8"));

type Stats = { rms: number; peak: number; zcr: number; nan: boolean; samples: Float32Array };

function render(proc: InstanceType<typeof ProcessorClass>, seconds: number, rpm: () => number, thr: () => number): Stats {
  const blocks = Math.round((seconds * FS) / BLOCK);
  const samples = new Float32Array(blocks * BLOCK);
  let sum = 0;
  let peak = 0;
  let crossings = 0;
  let nan = false;
  let prev = 0;
  let n = 0;
  for (let b = 0; b < blocks; b++) {
    const out = new Float32Array(BLOCK);
    proc.process([], [[out]], { rpm: new Float32Array([rpm()]), throttle: new Float32Array([thr()]) });
    for (let i = 0; i < BLOCK; i++) {
      const s = out[i];
      if (!Number.isFinite(s)) nan = true;
      sum += s * s;
      peak = Math.max(peak, Math.abs(s));
      if ((prev <= 0 && s > 0) || (prev >= 0 && s < 0)) crossings++;
      prev = s;
      samples[n++] = s;
    }
  }
  return { rms: Math.sqrt(sum / n), peak, zcr: crossings / seconds, nan, samples };
}

/** Normalized autocorrelation at a given lag */
function autocorr(x: Float32Array, lag: number): number {
  let num = 0;
  let den = 0;
  for (let i = lag; i < x.length; i++) {
    num += x[i] * x[i - lag];
    den += x[i] * x[i];
  }
  return den > 0 ? num / den : 0;
}

let failures = 0;
function check(cond: boolean, label: string) {
  if (!cond) {
    failures++;
    console.log(`  ❌ ${label}`);
  } else {
    console.log(`  ✓ ${label}`);
  }
}

console.log("=== Worklet voices: idle -> WOT pull -> lift-off ===");
for (const p of PROFILES) {
  if (p.kind !== "engine" && p.kind !== "fx") continue;
  console.log(`\n[${p.id}] ${p.name}`);
  const proc = new ProcessorClass!({
    processorOptions: { ...p.params, idleRpm: p.idleRpm, redlineRpm: p.redlineRpm },
  });

  // 1) idle, 2s (let it settle 0.5s first)
  render(proc, 0.5, () => p.idleRpm, () => 0.1);
  const idle = render(proc, 1.5, () => p.idleRpm, () => 0.1);
  check(!idle.nan, "idle: no NaN");
  check(idle.rms > 0.005, `idle: audible (rms=${idle.rms.toFixed(4)})`);
  check(idle.peak <= 1.0, `idle: no clipping (peak=${idle.peak.toFixed(3)})`);

  // 2) full-throttle pull to 90% redline over 2.5s
  let t = 0;
  const pullDur = 2.5;
  const pull = render(
    proc,
    pullDur,
    () => {
      t += BLOCK / FS;
      const k = Math.min(1, t / pullDur);
      return p.idleRpm + (0.9 * p.redlineRpm - p.idleRpm) * k;
    },
    () => 1
  );
  check(!pull.nan, "pull: no NaN");
  if (p.kind === "engine") {
    check(pull.rms > idle.rms * 1.1, `pull: louder than idle (${pull.rms.toFixed(4)} > ${idle.rms.toFixed(4)})`);
    // Pitch tracking: the output must be periodic at the firing rate.
    // (zero-crossing rate is useless here — exhaust formants anchor the
    // spectrum — so check autocorrelation at the expected firing period.)
    // Throttle 0.2 keeps turbo boost/noise out of the way.
    for (const frac of [0.25, 0.8]) {
      const rpm = p.idleRpm + (p.redlineRpm - p.idleRpm) * frac;
      const st = render(proc, 0.8, () => rpm, () => 0.2);
      const fireHz = (rpm / 60) * (p.params.cylinders / 2);
      const revHz = rpm / 60;
      // Periodic at the firing rate, the rev rate (half-order partials), or
      // the full 720° cycle — any of these means pitch is tracking rpm.
      const lags = [fireHz, revHz, revHz / 2].map((hz) => Math.round(FS / hz));
      const atPeriod = Math.max(...lags.map((l) => autocorr(st.samples, l)));
      const offPeriod = autocorr(st.samples, Math.round(lags[0] * 1.37));
      check(
        atPeriod > 0.15 && atPeriod > offPeriod,
        `periodic at engine rate @${Math.round(rpm)}rpm (corr ${atPeriod.toFixed(2)} vs off ${offPeriod.toFixed(2)})`
      );
    }
  } else {
    check(pull.rms > idle.rms * 0.75, `pull: stays audible vs idle (${pull.rms.toFixed(4)} vs ${idle.rms.toFixed(4)})`);
    // FX voices whose oscillators sweep up should get brighter with speed
    const oscLayers = p.params.layers.filter((l) => l.osc !== "noise" && l.f1! > l.f0! * 1.5);
    if (oscLayers.length >= 2) {
      const lowZ = render(proc, 0.7, () => p.idleRpm + (p.redlineRpm - p.idleRpm) * 0.1, () => 0.5);
      const highZ = render(proc, 0.7, () => p.idleRpm + (p.redlineRpm - p.idleRpm) * 0.9, () => 0.5);
      check(highZ.zcr > lowZ.zcr * 1.15, `brightness rises with speed (zcr ${Math.round(lowZ.zcr)} -> ${Math.round(highZ.zcr)})`);
    }
  }

  // 3) hard lift-off from high rpm
  let rpmNow = p.redlineRpm * 0.85;
  const lift = render(
    proc,
    1.6,
    () => {
      rpmNow = Math.max(p.idleRpm, rpmNow - (p.redlineRpm / 2.2) * (BLOCK / FS));
      return rpmNow;
    },
    () => 0.03
  );
  check(!lift.nan, "lift-off: no NaN");
  check(lift.rms > 0.002, `lift-off: still audible (rms=${lift.rms.toFixed(4)})`);
  if (p.kind === "engine") {
    const params = p.params;
    if (params.turbo && params.turbo.bov > 0) {
      check((proc.bovEnv as number) > 0 || (proc.boost as number) < 0.4, "turbo: blow-off fired / boost dumped");
    }
    if ((params.crackle ?? 0) > 0.2) {
      check((proc.crackleEnv as number) > 0.01 || (proc.popEnv as number) > 0, "overrun crackle armed");
    }
  }
}

// ---- drivetrain simulation: launch -> cruise -> lift -> stop ----
console.log("\n=== Drivetrain: launch -> cruise -> lift-off -> stop ===");
const train = new Drivetrain();
train.reset(800);
const opts = { idleRpm: 800, redlineRpm: 6800, maxSpeed: 70, shiftStyle: "medium" as const, response: 0.5 };
const dt = 1 / 60;
let speed = 0;
let maxGear = 1;
let minThrottleAfterLift = 1;
let rpmOk = true;
let gearJumps = 0;
let lastGear = 1;
let lastShiftT = -10;
let minShiftGap = 10;
let liftThrottleTime = -1;
const liftStart = 30; // seconds

for (let time = 0; time < 45; time += dt) {
  if (time < 18) speed = Math.min(70, speed + 5.5 * dt); // hard launch
  else if (time < liftStart) speed = 70; // cruise
  else speed = Math.max(0, speed - 6 * dt); // lift off + coast down
  // GPS updates at 1Hz with noise
  const gps = Math.round(speed) + (Math.random() - 0.5) * 0.6;
  const st = train.tick(gps, dt, false, opts);
  if (!Number.isFinite(st.rpm) || st.rpm < 700 || st.rpm > 7200) rpmOk = false;
  maxGear = Math.max(maxGear, st.gear);
  if (st.gear !== lastGear) {
    if (Math.abs(st.gear - lastGear) > 1) gearJumps++;
    minShiftGap = Math.min(minShiftGap, time - lastShiftT);
    lastShiftT = time;
    lastGear = st.gear;
  }
  if (time > liftStart + 0.5 && time < liftStart + 4) {
    minThrottleAfterLift = Math.min(minThrottleAfterLift, st.throttle);
    if (st.throttle < 0.15 && liftThrottleTime < 0) liftThrottleTime = time - liftStart;
  }
}
check(rpmOk, "rpm always finite and inside [700, 7200]");
check(maxGear === 6, `reaches top gear (got ${maxGear})`);
check(gearJumps === 0, "no gear skipping");
check(minShiftGap > 0.3, `shift lockout respected (min gap ${minShiftGap.toFixed(2)}s)`);
check(minThrottleAfterLift < 0.15, `lift-off closes throttle (min ${minThrottleAfterLift.toFixed(2)})`);
check(liftThrottleTime > 0 && liftThrottleTime < 2.5, `overrun begins quickly after lift (${liftThrottleTime.toFixed(2)}s)`);

// rev test
train.reset(800);
let revPeak = 0;
for (let time = 0; time < 2; time += dt) revPeak = Math.max(revPeak, train.tick(0, dt, true, opts).rpm);
let fellBack = 0;
for (let time = 0; time < 3; time += dt) fellBack = train.tick(0, dt, false, opts).rpm;
check(revPeak > 6500, `REV climbs to redline (peak ${Math.round(revPeak)})`);
check(fellBack < 900, `revs fall back to idle (${Math.round(fellBack)})`);

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
