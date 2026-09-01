export type TurboParams = {
  level: number; // whine gain
  noise: number; // compressor rush gain
  hz: [number, number]; // whine frequency range mapped to boost
  bov: number; // blow-off gain on throttle lift
  flutterHz: number; // "stu-tu-tu" rate
  flutterDepth: number;
};

export type EngineParams = {
  mode: "engine";
  cylinders: number;
  firingOrder: number[];
  /** optional crank angles in degrees for each fire event (1..n) — omit for even 720/n spacing */
  firingAngles?: number[];
  /** bank (0|1) for each cylinder number 1..n — bank split creates the burble */
  bankOf: number[];
  /** fixed exhaust formants: [freqHz, Q, gain] */
  resonators: [number, number, number][];
  /** pulse length as a fraction of the firing interval (short=sharp, long=rumble) */
  pulseTau?: number;
  /** pulse length at redline (morphs from pulseTau) — shorter = harder top end */
  pulseTauHigh?: number;
  noiseMix?: number;
  ampJitter?: number;
  /** idle lope/misfire tendency 0..1 */
  lope?: number;
  subGain?: number;
  thumpGain?: number;
  thumpHz?: number;
  /** overrun crackle amount 0..1 */
  crackle?: number;
  turbo?: TurboParams;
  /** roots/twin-screw blower: whine at rpm/60*ratio */
  supercharger?: { ratio: number; level: number };
  /** phase-locked engine-order sines (BMW-style intake note) */
  orderStack?: { o: number; g: number; rise: number }[];
  orderStackLevel?: number;
  /** exhaust rasp under load: filtered noise through two bandpasses */
  rasp?: { level: number; hz: [number, number]; loadPow: number; knee: number };
  /** intake gulp noise gated by load */
  intake?: { level: number; hz: number; q: number };
  /** diesel injector knock ping per firing */
  knock?: { level: number; hz: number; q: number };
  /** anti-lag detonations on lift-off */
  antilag?: { level: number; rate: number };
  drive?: number;
};

export type FxLayer = {
  osc: "sine" | "saw" | "tri" | "square" | "noise";
  /** oscillator frequency at norm 0 / norm 1 (Hz). Ignored for noise. */
  f0?: number;
  f1?: number;
  filter?: { type: "lp" | "bp" | "hp"; f0: number; f1: number; q: number };
  /** gain at norm 0 / norm 1 */
  g0: number;
  g1: number;
  /** extra gain proportional to throttle load */
  gLoad?: number;
  lfo?: { hz: number; depth: number; target: "gain" | "freq" | "filter" };
};

export type FxParams = {
  mode: "fx";
  layers: FxLayer[];
  /** noise swell fired when throttle spikes (kick/launch) */
  kick?: { gain: number; hz: number; q: number; decay: number };
  /** blow-off style hiss sweeping down when throttle closes at speed */
  liftHiss?: { gain: number; f0: number; f1: number; dur: number };
};

export type EngineProfile = {
  kind: "engine";
  id: string;
  name: string;
  emoji: string;
  idleRpm: number;
  redlineRpm: number;
  baseGain: number;
  params: EngineParams;
};

export type FxProfile = {
  kind: "fx";
  id: string;
  name: string;
  emoji: string;
  idleRpm: number;
  redlineRpm: number;
  baseGain: number;
  /** continuous voices don't step through gears */
  continuous?: boolean;
  params: FxParams;
};

export type SampleProfile = {
  kind: "sample";
  id: string;
  name: string;
  emoji: string;
  url: string;
  idleRpm: number;
  redlineRpm: number;
  baseGain: number;
  /** playbackRate at idle / redline */
  rateRange: [number, number];
  lowshelf?: { hz: number; db: number };
};

export type C63Profile = {
  kind: "c63";
  id: string;
  name: string;
  emoji: string;
  wavUrl: string;
  jsonUrl: string;
  idleRpm: number;
  redlineRpm: number;
  baseGain: number;
};

export type SoundProfile = EngineProfile | FxProfile | SampleProfile | C63Profile;
