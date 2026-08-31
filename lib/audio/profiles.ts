export type SynthProfile = {
  kind: "synth";
  id: string;
  name: string;
  emoji: string;
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  baseGain: number;
  waveform: OscillatorType;
  harmonics: { mult: number; gain: number; type: OscillatorType }[];
  noiseGain: number;
  filterBase: number;
  filterTrack: number;
  distortion: number;
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

export type SoundProfile = SynthProfile | SampleProfile;

export const PROFILES: SoundProfile[] = [
  {
    kind: "synth",
    id: "v8",
    name: "V8 Muscle",
    emoji: "🏁",
    cylinders: 8,
    idleRpm: 750,
    redlineRpm: 6500,
    baseGain: 0.55,
    waveform: "sawtooth",
    harmonics: [
      { mult: 0.5, gain: 0.7, type: "sawtooth" },
      { mult: 1, gain: 1.0, type: "sawtooth" },
      { mult: 2, gain: 0.35, type: "square" },
      { mult: 3, gain: 0.15, type: "sawtooth" },
    ],
    noiseGain: 0.14,
    filterBase: 180,
    filterTrack: 2400,
    distortion: 24,
  },
  {
    kind: "synth",
    id: "v6-sport",
    name: "V6 Sport",
    emoji: "🏎️",
    cylinders: 6,
    idleRpm: 850,
    redlineRpm: 7800,
    baseGain: 0.5,
    waveform: "sawtooth",
    harmonics: [
      { mult: 1, gain: 1.0, type: "sawtooth" },
      { mult: 1.5, gain: 0.4, type: "sawtooth" },
      { mult: 2, gain: 0.5, type: "sawtooth" },
      { mult: 4, gain: 0.12, type: "triangle" },
    ],
    noiseGain: 0.1,
    filterBase: 260,
    filterTrack: 3600,
    distortion: 16,
  },
  {
    kind: "synth",
    id: "ev-whine",
    name: "EV Whine",
    emoji: "⚡",
    cylinders: 2,
    idleRpm: 400,
    redlineRpm: 12000,
    baseGain: 0.35,
    waveform: "triangle",
    harmonics: [
      { mult: 8, gain: 0.9, type: "sine" },
      { mult: 12, gain: 0.5, type: "triangle" },
      { mult: 16, gain: 0.25, type: "sine" },
      { mult: 1, gain: 0.4, type: "sine" },
    ],
    noiseGain: 0.03,
    filterBase: 500,
    filterTrack: 6000,
    distortion: 4,
  },
  {
    kind: "synth",
    id: "warp",
    name: "Sci-Fi Warp",
    emoji: "🛸",
    cylinders: 2,
    idleRpm: 500,
    redlineRpm: 9000,
    baseGain: 0.4,
    waveform: "sawtooth",
    harmonics: [
      { mult: 1, gain: 0.8, type: "sawtooth" },
      { mult: 1.02, gain: 0.8, type: "sawtooth" },
      { mult: 0.99, gain: 0.6, type: "sawtooth" },
      { mult: 6, gain: 0.3, type: "sine" },
    ],
    noiseGain: 0.08,
    filterBase: 300,
    filterTrack: 5000,
    distortion: 10,
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
