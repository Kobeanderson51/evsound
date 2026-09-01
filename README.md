# EV Sound FX

Speed-reactive engine sounds for your EV, played through the car speakers. Open it in the
Tesla in-car browser (or on your phone connected via Bluetooth), tap START, and the app
synthesizes engine audio that follows your real GPS speed — virtual gears, shift styles,
and a hold-to-rev button included.

## How it works

- **Speed**: read from the browser Geolocation API (the Tesla browser and phones provide GPS).
- **RPM simulation**: speed is mapped through 6 virtual gears with configurable shift styles.
- **Audio**: generated in real time with the Web Audio API — no audio files, no plugins.

Everything runs 100% in your browser. No accounts, no data collection, no analytics, and no
network requests after the page loads. Your location never leaves the device.

## Features

- Speed-reactive RPM and 6-gear simulation from GPS or Demo mode
- 40+ sound profiles: real V8 recordings, classic/muscle/JDM engines, EV/sci-fi, and motorcycles/race
- Sound Studio: design and save your own layered FX sound
- Live Tuning panel: tweak engine crackle, turbo, intake, and gain while playing
- Full-screen Speed/RPM/Eco HUD
- Manual / paddle shift mode with 1-6 gear selection
- Launch / rev limiter button
- Audio recording and download
- Dark & light dashboard themes
- PWA support for install to home screen
- Settings and custom profile automatically saved locally

## Sounds

Real recordings: �️ Mercedes C63 AMG — Real V8 (multi-RPM sample bank) · 😈 Supercharged
V8 Howl · 👻 Eerie Horror

Synthesized engines: � Cammed American V8 · 🌪️ Blown V8 Whine · 🌀 Turbo Grit Rumble ·
🚙 Boxer Rally Turbo · 💥 Rally Anti-Lag · 🇩🇪 Inline-Six Turbo (B58) · 🚛 Turbo Diesel
Stack · 🚀 High Pitch Screamer

EV / sci-fi: ⚡ Electric Swell · 🔌 Electric Supercharger · 🛸 Hypercar Whistle ·
✈️ Turbine Spool-Up · 🦅 Twin Screamer Jets · 🚁 Retro Hover Car · 🌑 Deep Grid Rumble ·
🌌 Warp Drive · 🧘 Calm 432Hz Hum

To add a real recorded engine loop, drop an audio file in `public/sounds/` and add a
`kind: "sample"` entry in `lib/audio/profileData.ts`.

## Settings

Volume · Max speed · Response (smoother/faster) · Shift style (Relaxed/Medium/Sport) ·
Exterior Boost (loud at idle for outside/Bluetooth speakers) · Audio Stability Mode
(extra buffering for devices that crackle) · Motion assist (phone accelerometer for
quicker throttle cues) · Manual / paddle shift · Demo mode (test without driving) ·
Light mode

## Project layout

- `app/page.tsx` — main dashboard and controls
- `app/manifest.ts` — PWA manifest
- `components/` — React components (Sound Studio, Tuning Panel, HUD overlay)
- `lib/audio/` — audio engine, sound profile data/types, and worklet
- `lib/drivetrain.ts` — vehicle physics (speed → RPM/gear)
- `lib/useSpeed.ts` — GPS speed hook
- `public/engine-worklet.js` — Web Audio processor for synthesized sound
- `public/sounds/` — real recorded audio samples

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use **Demo mode** in Settings to
simulate speed without GPS.

## Using it in the car

1. Deploy (e.g. [Vercel](https://vercel.com): `npx vercel`) — the Tesla browser needs an
   HTTPS URL, and geolocation only works over HTTPS.
2. Open the URL on the Tesla touchscreen (or your phone).
3. Tap **START** and allow location access when prompted.
4. Keep the tab active while driving — browsers pause audio when fully backgrounded.

⚠️ Set up your sound before you drive. Keep your eyes on the road.
