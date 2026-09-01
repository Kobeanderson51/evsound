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

const V8_CROSS_BANKS = [0, 1, 0, 1, 0, 1, 0, 1]; // odd/even banks
const BOXER_BANKS = [0, 1, 0, 1];

export const PROFILES: SoundProfile[] = [
  // ============================ REAL RECORDINGS ============================
  {
    kind: "c63",
    id: "german62biturbo",
    name: "Mercedes C63 AMG — Real V8",
    emoji: "🎙️",
    wavUrl: "/sounds/c63-real-engine-bank.wav",
    jsonUrl: "/sounds/c63-real-engine-bank.json",
    idleRpm: 750,
    redlineRpm: 6200,
    baseGain: 1.0,
  },
  {
    kind: "sample",
    id: "hellcat",
    name: "Supercharged V8 Howl",
    emoji: "😈",
    url: "/sounds/hellcat-idle.mp3",
    idleRpm: 750,
    redlineRpm: 6200,
    baseGain: 0.85,
    rateRange: [0.9, 1.75],
    lowshelf: { hz: 110, db: 7 },
  },

  // ========================== SYNTHESIZED ENGINES ==========================
  {
    kind: "engine",
    id: "cammedv8",
    name: "Cammed American V8",
    emoji: "🏁",
    idleRpm: 850,
    redlineRpm: 6200,
    baseGain: 0.9,
    params: {
      mode: "engine",
      cylinders: 8,
      firingOrder: [1, 8, 4, 3, 6, 5, 7, 2], // crossplane — uneven per-bank gaps = burble
      bankOf: V8_CROSS_BANKS,
      resonators: [
        [50, 1.5, 1.6],
        [100, 1.9, 1.3],
        [200, 2.4, 0.8],
        [430, 2.8, 0.38],
        [1050, 3.2, 0.14],
      ],
      pulseTau: 0.34,
      noiseMix: 0.22,
      ampJitter: 0.08,
      lope: 0.85,
      subGain: 0.06,
      thumpGain: 0.95,
      thumpHz: 52,
      crackle: 0.5,
      supercharger: { ratio: 7.1, level: 0.05 },
      intake: { level: 0.22, hz: 320, q: 3.2 },
      drive: 1.7,
    },
  },
  {
    kind: "engine",
    id: "blownv8",
    name: "Blown V8 Whine",
    emoji: "�️",
    idleRpm: 800,
    redlineRpm: 6300,
    baseGain: 0.9,
    params: {
      mode: "engine",
      cylinders: 8,
      firingOrder: [1, 8, 4, 3, 6, 5, 7, 2],
      bankOf: V8_CROSS_BANKS,
      resonators: [
        [52, 1.5, 1.6],
        [104, 1.9, 1.3],
        [208, 2.4, 0.8],
        [450, 2.8, 0.38],
        [1100, 3.2, 0.15],
      ],
      pulseTau: 0.32,
      noiseMix: 0.21,
      ampJitter: 0.07,
      lope: 0.1, // tight cams — clean idle under boost
      subGain: 0.06,
      thumpGain: 0.95,
      thumpHz: 54,
      crackle: 0.35,
      supercharger: { ratio: 7.1, level: 0.16 },
      intake: { level: 0.3, hz: 320, q: 3.2 },
      drive: 1.75,
    },
  },
  {
    kind: "engine",
    id: "turborumble",
    name: "Turbo Grit Rumble",
    emoji: "🌀",
    idleRpm: 850,
    redlineRpm: 6800,
    baseGain: 0.9,
    params: {
      mode: "engine",
      cylinders: 4,
      firingOrder: [1, 3, 4, 2],
      bankOf: [0, 0, 0, 0],
      resonators: [
        [100, 1.7, 1.35],
        [200, 2.2, 1.1],
        [400, 2.6, 0.7],
        [700, 3.0, 0.4],
        [1500, 3.4, 0.16],
      ],
      pulseTau: 0.28,
      noiseMix: 0.26,
      ampJitter: 0.06,
      lope: 0.3,
      subGain: 0.1,
      thumpGain: 0.8,
      thumpHz: 66,
      crackle: 0.2,
      turbo: { level: 0.28, noise: 0.3, hz: [1600, 6800], bov: 0.7, flutterHz: 22, flutterDepth: 0.55 },
      intake: { level: 0.45, hz: 320, q: 3.2 },
      drive: 1.7,
    },
  },
  {
    kind: "engine",
    id: "boxerturbo",
    name: "Boxer Rally Turbo",
    emoji: "🚙",
    idleRpm: 800,
    redlineRpm: 6700,
    baseGain: 0.9,
    params: {
      mode: "engine",
      cylinders: 4,
      firingOrder: [1, 3, 2, 4], // boxer — unequal headers = classic subaru rumble
      bankOf: BOXER_BANKS,
      resonators: [
        [48, 1.5, 1.55],
        [96, 1.9, 1.25],
        [200, 2.4, 0.78],
        [450, 2.8, 0.36],
        [1150, 3.2, 0.14],
      ],
      pulseTau: 0.36,
      noiseMix: 0.24,
      ampJitter: 0.09,
      lope: 0.45,
      subGain: 0.06,
      thumpGain: 0.9,
      thumpHz: 56,
      crackle: 0.15,
      turbo: { level: 0.3, noise: 0.28, hz: [1800, 7200], bov: 0.75, flutterHz: 24, flutterDepth: 0.6 },
      intake: { level: 0.42, hz: 320, q: 3.2 },
      drive: 1.7,
    },
  },
  {
    kind: "engine",
    id: "rallyantilag",
    name: "Rally Anti-Lag",
    emoji: "�",
    idleRpm: 950,
    redlineRpm: 7200,
    baseGain: 0.9,
    params: {
      mode: "engine",
      cylinders: 4,
      firingOrder: [1, 3, 2, 4],
      bankOf: BOXER_BANKS,
      resonators: [
        [50, 1.5, 1.5],
        [100, 1.9, 1.2],
        [215, 2.5, 0.8],
        [480, 2.9, 0.42],
        [1250, 3.3, 0.18],
      ],
      pulseTau: 0.3,
      noiseMix: 0.3,
      ampJitter: 0.11,
      lope: 0.35,
      subGain: 0.16,
      thumpGain: 0.85,
      thumpHz: 58,
      crackle: 0.5,
      turbo: { level: 0.42, noise: 0.4, hz: [1900, 7400], bov: 0.85, flutterHz: 30, flutterDepth: 0.9 },
      antilag: { level: 0.8, rate: 0.06 },
      intake: { level: 0.5, hz: 300, q: 2.8 },
      drive: 1.85,
    },
  },
  {
    kind: "engine",
    id: "b58",
    name: "Inline-Six Turbo (B58)",
    emoji: "🇩🇪",
    idleRpm: 720,
    redlineRpm: 7000,
    baseGain: 0.85,
    params: {
      mode: "engine",
      cylinders: 6,
      firingOrder: [1, 5, 3, 6, 2, 4],
      bankOf: [0, 0, 0, 1, 1, 1], // split by turbo scroll
      resonators: [
        [58, 1.4, 0.72],
        [116, 1.7, 0.88],
        [232, 2.2, 0.95],
        [470, 2.7, 0.85],
        [940, 3.0, 0.62],
        [1750, 3.2, 0.44],
        [2650, 3.4, 0.3],
      ],
      pulseTau: 0.27,
      pulseTauHigh: 0.16,
      noiseMix: 0.15,
      ampJitter: 0.03,
      lope: 0.05,
      subGain: 0.05,
      thumpGain: 0.85,
      thumpHz: 60,
      crackle: 0.4,
      turbo: { level: 0.24, noise: 0.26, hz: [1250, 4400], bov: 0.75, flutterHz: 26, flutterDepth: 0.7 },
      orderStack: [
        { o: 1, g: 2.2, rise: 0 },
        { o: 1.5, g: 0.35, rise: 0 },
        { o: 2, g: 5.4, rise: 0 },
        { o: 3, g: 1.0, rise: 0.1 },
        { o: 4, g: 3.9, rise: 0.05 },
        { o: 6, g: 1.6, rise: 0.4 },
        { o: 9, g: 1.25, rise: 0.55 },
        { o: 12, g: 0.92, rise: 0.7 },
        { o: 15, g: 0.58, rise: 0.8 },
        { o: 18, g: 0.34, rise: 0.88 },
      ],
      orderStackLevel: 0.09,
      rasp: { level: 0.085, hz: [1700, 3900], loadPow: 2.2, knee: 0.3 },
      intake: { level: 0.6, hz: 420, q: 3.4 },
      drive: 1.75,
    },
  },
  {
    kind: "engine",
    id: "dieselstack",
    name: "Turbo Diesel Stack",
    emoji: "🚛",
    idleRpm: 620,
    redlineRpm: 2900,
    baseGain: 0.95,
    params: {
      mode: "engine",
      cylinders: 6,
      firingOrder: [1, 5, 3, 6, 2, 4],
      bankOf: [0, 0, 0, 0, 0, 0],
      resonators: [
        [55, 1.5, 1.7],
        [110, 1.9, 1.35],
        [220, 2.3, 0.72],
        [470, 2.5, 0.3],
        [1150, 2.6, 0.12],
      ],
      pulseTau: 0.42,
      noiseMix: 0.2,
      ampJitter: 0.13,
      lope: 0.55,
      subGain: 0.07,
      thumpGain: 1.15,
      thumpHz: 44,
      crackle: 0,
      knock: { level: 0.5, hz: 2150, q: 10 },
      turbo: { level: 0.18, noise: 0.3, hz: [900, 4200], bov: 0.4, flutterHz: 12, flutterDepth: 0.4 },
      intake: { level: 0.2, hz: 260, q: 2.6 },
      drive: 1.45,
    },
  },
  {
    kind: "engine",
    id: "highscreamer",
    name: "High Pitch Screamer",
    emoji: "🚀",
    idleRpm: 900,
    redlineRpm: 8500,
    baseGain: 0.85,
    params: {
      mode: "engine",
      cylinders: 10,
      firingOrder: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9],
      bankOf: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      resonators: [
        [100, 2.0, 0.7],
        [252, 2.6, 1.0],
        [492, 3.0, 0.85],
        [984, 3.6, 0.3],
        [1330, 3.8, 0.18],
        [2400, 3.8, 0.08],
      ],
      pulseTau: 0.19,
      noiseMix: 0.24,
      ampJitter: 0.035,
      lope: 0.1,
      subGain: 0.03,
      thumpGain: 0.65,
      thumpHz: 76,
      crackle: 0.95,
      intake: { level: 0.6, hz: 520, q: 4.0 },
      drive: 2.4,
    },
  },

  // ============================== EV / SCI-FI ==============================
  {
    kind: "fx",
    id: "etron",
    name: "Electric Swell",
    emoji: "⚡",
    idleRpm: 400,
    redlineRpm: 12000,
    baseGain: 0.8,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "sine", f0: 36, f1: 145, g0: 0.42, g1: 0.42 },
        { osc: "sine", f0: 36.6, f1: 145.6, g0: 0.42, g1: 0.42 },
        { osc: "sine", f0: 18, f1: 72.5, g0: 0.42, g1: 0.5 },
        { osc: "saw", f0: 69, f1: 287, filter: { type: "lp", f0: 260, f1: 1500, q: 0.8 }, g0: 0.16, g1: 0.16, lfo: { hz: 0.09, depth: 0.25, target: "filter" } },
        { osc: "saw", f0: 75, f1: 293, filter: { type: "lp", f0: 260, f1: 1500, q: 0.8 }, g0: 0.16, g1: 0.16 },
        { osc: "noise", filter: { type: "lp", f0: 350, f1: 2200, q: 3.2 }, g0: 0.05, g1: 0.14 },
      ],
      kick: { gain: 0.22, hz: 900, q: 1.2, decay: 0.9 },
    },
  },
  {
    kind: "fx",
    id: "supercharger",
    name: "Electric Supercharger",
    emoji: "�",
    idleRpm: 500,
    redlineRpm: 11000,
    baseGain: 0.8,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "sine", f0: 62, f1: 205, filter: { type: "lp", f0: 700, f1: 2100, q: 0.5 }, g0: 0.42, g1: 0.64 },
        { osc: "sine", f0: 62.6, f1: 205.6, filter: { type: "lp", f0: 700, f1: 2100, q: 0.5 }, g0: 0.42, g1: 0.64 },
        { osc: "sine", f0: 31, f1: 102, g0: 0.24, g1: 0.38 },
        { osc: "tri", f0: 124, f1: 410, filter: { type: "lp", f0: 1400, f1: 1400, q: 0.7 }, g0: 0, g1: 0.22 },
        { osc: "saw", f0: 340, f1: 1750, filter: { type: "bp", f0: 544, f1: 2800, q: 2.4 }, g0: 0.045, g1: 0.35, gLoad: 0.08 },
        { osc: "square", f0: 340, f1: 1750, filter: { type: "bp", f0: 544, f1: 2800, q: 2.4 }, g0: 0.04, g1: 0.3, lfo: { hz: 0.13, depth: 0.004, target: "freq" } },
        { osc: "saw", f0: 510, f1: 2625, filter: { type: "bp", f0: 544, f1: 2800, q: 2.4 }, g0: 0.04, g1: 0.3 },
        { osc: "noise", filter: { type: "bp", f0: 400, f1: 3000, q: 0.9 }, g0: 0.02, g1: 0.08 },
      ],
      kick: { gain: 0.26, hz: 1600, q: 1.4, decay: 0.55 },
      liftHiss: { gain: 0.3, f0: 4600, f1: 900, dur: 0.6 },
    },
  },
  {
    kind: "fx",
    id: "turboufo",
    name: "Hypercar Whistle",
    emoji: "🛸",
    idleRpm: 600,
    redlineRpm: 9000,
    baseGain: 0.8,
    params: {
      mode: "fx",
      layers: [
        { osc: "sine", f0: 40, f1: 150, g0: 0.55, g1: 0.55 },
        { osc: "sine", f0: 40.6, f1: 150.6, g0: 0.35, g1: 0.35 },
        { osc: "tri", f0: 300, f1: 300, filter: { type: "bp", f0: 600, f1: 950, q: 3 }, g0: 0.12, g1: 0.12, lfo: { hz: 0.1, depth: 0.3, target: "filter" } },
        { osc: "saw", f0: 200, f1: 900, filter: { type: "bp", f0: 400, f1: 1800, q: 4 }, g0: 0.06, g1: 0.18 },
        { osc: "sine", f0: 1200, f1: 3000, filter: { type: "bp", f0: 1600, f1: 1600, q: 10 }, g0: 0, g1: 0.12, gLoad: 0.06 },
        { osc: "noise", filter: { type: "lp", f0: 400, f1: 2600, q: 2.5 }, g0: 0.04, g1: 0.12 },
      ],
      kick: { gain: 0.3, hz: 2500, q: 1, decay: 0.5 },
      liftHiss: { gain: 0.22, f0: 4200, f1: 700, dur: 0.65 },
    },
  },
  {
    kind: "fx",
    id: "jetturbine",
    name: "Turbine Spool-Up",
    emoji: "✈️",
    idleRpm: 500,
    redlineRpm: 10000,
    baseGain: 0.8,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "saw", f0: 160, f1: 950, filter: { type: "bp", f0: 320, f1: 1900, q: 4 }, g0: 0.16, g1: 0.5, lfo: { hz: 5.2, depth: 0.06, target: "gain" } },
        { osc: "saw", f0: 240, f1: 1428, filter: { type: "bp", f0: 320, f1: 1900, q: 4 }, g0: 0.14, g1: 0.44, lfo: { hz: 6.7, depth: 0.05, target: "gain" } },
        { osc: "sine", f0: 40, f1: 237, g0: 0.26, g1: 0.44 },
        { osc: "noise", filter: { type: "bp", f0: 500, f1: 3700, q: 0.8 }, g0: 0.02, g1: 0.09 },
      ],
      kick: { gain: 0.3, hz: 2500, q: 1, decay: 0.5 },
    },
  },
  {
    kind: "fx",
    id: "twinscreamer",
    name: "Twin Screamer Jets",
    emoji: "🦅",
    idleRpm: 600,
    redlineRpm: 10000,
    baseGain: 0.78,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "saw", f0: 300, f1: 2200, filter: { type: "bp", f0: 600, f1: 4400, q: 4 }, g0: 0.12, g1: 0.42, lfo: { hz: 7.3, depth: 0.05, target: "gain" } },
        { osc: "saw", f0: 303, f1: 2222, filter: { type: "bp", f0: 600, f1: 4400, q: 4 }, g0: 0.12, g1: 0.42 },
        { osc: "saw", f0: 312, f1: 2288, filter: { type: "bp", f0: 624, f1: 4576, q: 4 }, g0: 0.12, g1: 0.42, lfo: { hz: 9.1, depth: 0.05, target: "gain" } },
        { osc: "sine", f0: 60, f1: 440, g0: 0.22, g1: 0.38 },
        { osc: "noise", filter: { type: "bp", f0: 600, f1: 3400, q: 0.7 }, g0: 0.02, g1: 0.08 },
      ],
      kick: { gain: 0.35, hz: 1800, q: 1, decay: 0.6 },
    },
  },
  {
    kind: "fx",
    id: "jetsons",
    name: "Retro Hover Car",
    emoji: "🚁",
    idleRpm: 500,
    redlineRpm: 9000,
    baseGain: 0.75,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "sine", f0: 320, f1: 1100, g0: 0.22, g1: 0.22, lfo: { hz: 6.5, depth: 0.012, target: "freq" } },
        { osc: "sine", f0: 160, f1: 550, g0: 0.14, g1: 0.14 },
        { osc: "noise", filter: { type: "bp", f0: 1000, f1: 2000, q: 1.5 }, g0: 0.02, g1: 0.05 },
      ],
      kick: { gain: 0.18, hz: 1400, q: 1.5, decay: 0.5 },
    },
  },
  {
    kind: "fx",
    id: "deepgrid",
    name: "Deep Grid Rumble",
    emoji: "🌑",
    idleRpm: 400,
    redlineRpm: 8000,
    baseGain: 0.9,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "saw", f0: 32, f1: 32, filter: { type: "lp", f0: 160, f1: 260, q: 0.7 }, g0: 0.35, g1: 0.7 },
        { osc: "saw", f0: 32.4, f1: 32.4, filter: { type: "lp", f0: 160, f1: 260, q: 0.7 }, g0: 0.35, g1: 0.7 },
        { osc: "saw", f0: 31.7, f1: 31.7, filter: { type: "lp", f0: 160, f1: 260, q: 0.7 }, g0: 0.35, g1: 0.7 },
        { osc: "sine", f0: 16, f1: 16, g0: 0.4, g1: 0.65 },
        { osc: "noise", filter: { type: "lp", f0: 180, f1: 240, q: 0.6 }, g0: 0.03, g1: 0.07 },
      ],
      kick: { gain: 0.25, hz: 200, q: 0.7, decay: 0.6 },
    },
  },
  {
    kind: "fx",
    id: "warpdrive",
    name: "Warp Drive",
    emoji: "�",
    idleRpm: 500,
    redlineRpm: 9000,
    baseGain: 0.8,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "sine", f0: 32, f1: 70, g0: 0.5, g1: 0.68, lfo: { hz: 1.2, depth: 0.12, target: "gain" } },
        { osc: "sine", f0: 32.4, f1: 70.4, g0: 0.4, g1: 0.55 },
        { osc: "sine", f0: 16, f1: 35, g0: 0.28, g1: 0.44 },
        { osc: "tri", f0: 187, f1: 640, filter: { type: "lp", f0: 300, f1: 1700, q: 0.6 }, g0: 0.1, g1: 0.32 },
        { osc: "tri", f0: 192, f1: 645, filter: { type: "lp", f0: 300, f1: 1700, q: 0.6 }, g0: 0.1, g1: 0.32 },
        { osc: "sine", f0: 950, f1: 950, filter: { type: "hp", f0: 500, f1: 500, q: 0.5 }, g0: 0.015, g1: 0.065 },
        { osc: "sine", f0: 1425, f1: 1425, filter: { type: "hp", f0: 500, f1: 500, q: 0.5 }, g0: 0.015, g1: 0.065, lfo: { hz: 0.09, depth: 0.004, target: "freq" } },
        { osc: "noise", filter: { type: "bp", f0: 650, f1: 2600, q: 1.4 }, g0: 0.015, g1: 0.045 },
      ],
      kick: { gain: 0.2, hz: 800, q: 1, decay: 1.6 },
    },
  },
  {
    kind: "fx",
    id: "calm",
    name: "Calm 432Hz Hum",
    emoji: "🧘",
    idleRpm: 400,
    redlineRpm: 8000,
    baseGain: 0.6,
    continuous: true,
    params: {
      mode: "fx",
      layers: [
        { osc: "sine", f0: 108, f1: 118, g0: 0.14, g1: 0.22, lfo: { hz: 0.167, depth: 0.05, target: "gain" } },
        { osc: "sine", f0: 162, f1: 177, g0: 0.12, g1: 0.16 },
        { osc: "sine", f0: 216, f1: 236, g0: 0.1, g1: 0.14 },
        { osc: "noise", filter: { type: "lp", f0: 500, f1: 500, q: 0.5 }, g0: 0.02, g1: 0.02 },
      ],
    },
  },
  {
    kind: "sample",
    id: "eeriehorror",
    name: "Eerie Horror",
    emoji: "👻",
    url: "/sounds/eerie-horror.mp3",
    idleRpm: 500,
    redlineRpm: 8000,
    baseGain: 0.9,
    rateRange: [0.8, 1.5],
  },
];
