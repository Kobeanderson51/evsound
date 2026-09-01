export type TurboParams = {
  level: number; // whine gain
  noise: number; // compressor rush gain
  hz: [number, number]; // whine frequency range mapped to boost
  bov: number; // blow-off gain on throttle lift
  flutterHz: number; // "stu-tu-tu" rate
  flutterDepth: number;
};

export type EngineParams = {
  mode: "engine" | "ev" | "warp";
  cylinders?: number;
  firingOrder?: number[];
  /** bank (0|1) for each cylinder number 1..n — bank split creates the burble */
  bankOf?: number[];
  /** fixed exhaust formants: [freqHz, Q, gain] */
  resonators?: [number, number, number][];
  /** pulse length as a fraction of the firing interval (short=sharp, long=rumble) */
  pulseTau?: number;
  noiseMix?: number;
  ampJitter?: number;
  /** idle lope/misfire tendency 0..1 */
  lope?: number;
  subGain?: number;
  thumpGain?: number;
  /** overrun crackle amount 0..1 */
  crackle?: number;
  turbo?: TurboParams;
  drive?: number;
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

export type SampleProfile = {
  kind: "sample";
  id: string;
  name: string;
  emoji: string;
  url: string;
  baseRpm: number;
  idleRpm: number;
  redlineRpm: number;
  baseGain: number;
};

export type SoundProfile = EngineProfile | SampleProfile;

const V8_CROSS_BANKS = [0, 1, 0, 1, 0, 1, 0, 1]; // odd/even banks
const V8_LOWHIGH_BANKS = [0, 0, 0, 0, 1, 1, 1, 1];

export const PROFILES: SoundProfile[] = [
  {
    kind: "engine",
    id: "v8-muscle",
    name: "V8 Muscle",
    emoji: "🏁",
    idleRpm: 750,
    redlineRpm: 6400,
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
      subGain: 0.4,
      thumpGain: 0.7,
      crackle: 0.5,
      drive: 1.7,
    },
  },
  {
    kind: "engine",
    id: "v8-supercar",
    name: "Supercar V8",
    emoji: "🏎️",
    idleRpm: 900,
    redlineRpm: 8600,
    baseGain: 0.85,
    params: {
      mode: "engine",
      cylinders: 8,
      firingOrder: [1, 5, 2, 6, 3, 7, 4, 8], // flat-plane — even bank gaps, screams
      bankOf: V8_LOWHIGH_BANKS,
      resonators: [
        [100, 1.7, 1.35],
        [200, 2.2, 1.15],
        [400, 2.8, 0.75],
        [800, 3.2, 0.45],
        [1900, 3.6, 0.2],
      ],
      pulseTau: 0.24,
      noiseMix: 0.24,
      ampJitter: 0.05,
      lope: 0.15,
      subGain: 0.2,
      thumpGain: 0.35,
      crackle: 0.4,
      drive: 1.9,
    },
  },
  {
    kind: "engine",
    id: "v8-twinturbo",
    name: "Twin-Turbo V8",
    emoji: "😈",
    idleRpm: 720,
    redlineRpm: 7200,
    baseGain: 0.9,
    params: {
      mode: "engine",
      cylinders: 8,
      firingOrder: [1, 5, 4, 8, 7, 2, 6, 3],
      bankOf: V8_LOWHIGH_BANKS,
      resonators: [
        [52, 1.45, 1.48],
        [104, 1.8, 1.38],
        [208, 2.25, 0.98],
        [390, 2.65, 0.62],
        [760, 3.0, 0.34],
        [1450, 3.25, 0.19],
        [2700, 3.45, 0.08],
      ],
      pulseTau: 0.3,
      noiseMix: 0.18,
      ampJitter: 0.05,
      lope: 0.4,
      subGain: 0.35,
      thumpGain: 0.55,
      crackle: 0.55,
      turbo: { level: 0.3, noise: 0.28, hz: [600, 3800], bov: 0.5, flutterHz: 30, flutterDepth: 0.6 },
      drive: 1.7,
    },
  },
  {
    kind: "engine",
    id: "turbo-rally",
    name: "Turbo Rally I4",
    emoji: "🌀",
    idleRpm: 900,
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
      noiseMix: 0.28,
      ampJitter: 0.09,
      lope: 0.35,
      subGain: 0.25,
      thumpGain: 0.4,
      crackle: 0.8,
      turbo: { level: 0.5, noise: 0.4, hz: [700, 4600], bov: 0.9, flutterHz: 33, flutterDepth: 0.8 },
      drive: 1.9,
    },
  },
  {
    kind: "engine",
    id: "v10",
    name: "V10 Exotic",
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
      subGain: 0.18,
      thumpGain: 0.3,
      crackle: 0.3,
      drive: 2.0,
    },
  },
  {
    kind: "engine",
    id: "v12",
    name: "V12 GT",
    emoji: "👑",
    idleRpm: 750,
    redlineRpm: 8800,
    baseGain: 0.85,
    params: {
      mode: "engine",
      cylinders: 12,
      firingOrder: [1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10],
      bankOf: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
      resonators: [
        [112, 2.0, 0.5],
        [268, 2.6, 1.0],
        [520, 3.0, 0.7],
        [780, 3.4, 0.3],
        [1040, 3.6, 0.22],
        [1420, 3.8, 0.14],
      ],
      pulseTau: 0.17,
      noiseMix: 0.2,
      ampJitter: 0.03,
      lope: 0.08,
      subGain: 0.22,
      thumpGain: 0.3,
      crackle: 0.25,
      drive: 2.0,
    },
  },
  {
    kind: "engine",
    id: "diesel",
    name: "Diesel Truck",
    emoji: "�",
    idleRpm: 620,
    redlineRpm: 3200,
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
      noiseMix: 0.4,
      ampJitter: 0.15,
      lope: 0.55,
      subGain: 0.45,
      thumpGain: 0.8,
      crackle: 0.1,
      turbo: { level: 0.22, noise: 0.3, hz: [500, 2600], bov: 0.3, flutterHz: 26, flutterDepth: 0.5 },
      drive: 1.6,
    },
  },
  {
    kind: "engine",
    id: "ev-whine",
    name: "EV Whine",
    emoji: "⚡",
    idleRpm: 400,
    redlineRpm: 12000,
    baseGain: 0.7,
    params: { mode: "ev" },
  },
  {
    kind: "engine",
    id: "warp",
    name: "Sci-Fi Warp",
    emoji: "🛸",
    idleRpm: 500,
    redlineRpm: 9000,
    baseGain: 0.75,
    params: { mode: "warp" },
  },
  // To add a real recorded engine loop, drop an audio file in public/sounds/
  // and add an entry like this (uncomment and adjust):
  // {
  //   kind: "sample",
  //   id: "real-v8",
  //   name: "Real V8 (sample)",
  //   emoji: "🎙️",
  //   url: "/sounds/v8-idle-loop.mp3",
  //   baseRpm: 2000, // the RPM the recording was captured at
  //   idleRpm: 800,
  //   redlineRpm: 6500,
  //   baseGain: 0.8,
  // },
];
