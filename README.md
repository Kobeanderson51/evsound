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

## Sounds

- 🏁 V8 Muscle
- 🏎️ V6 Sport
- ⚡ EV Whine
- 🛸 Sci-Fi Warp

To add a real recorded engine loop, drop an audio file in `public/sounds/` and add a
`kind: "sample"` entry in `lib/audio/profiles.ts` (example included in the file).

## Settings

Volume · Max speed · Response (smoother/faster) · Shift style (Relaxed/Medium/Sport) ·
Exterior Boost (loud at idle for outside/Bluetooth speakers) · Audio Stability Mode
(extra buffering for devices that crackle) · Motion assist (phone accelerometer for
quicker throttle cues) · Demo mode (test without driving)

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
