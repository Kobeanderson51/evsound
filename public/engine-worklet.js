/*
 * EV Sound FX engine processor.
 *
 * Physically-inspired combustion model: a crank-angle timeline (0-720deg per
 * four-stroke cycle) fires each cylinder in its real firing order. Every
 * firing injects a decaying pressure pulse + combustion noise into per-bank
 * "exhaust formant" resonators (fixed-frequency bandpass filters), so pitch
 * comes from the firing rate while the timbre stays anchored — like a real
 * exhaust. Turbo whine/rush, blow-off flutter, overrun crackle, idle lope and
 * per-cylinder jitter are layered on top. Also has EV and sci-fi modes.
 */

class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  bandpass(f, Q) {
    const w = (2 * Math.PI * Math.min(f, sampleRate * 0.45)) / sampleRate;
    const al = Math.sin(w) / (2 * Q);
    const c = Math.cos(w);
    const a0 = 1 + al;
    this.b0 = al / a0; this.b1 = 0; this.b2 = -al / a0;
    this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  lowpass(f, Q) {
    const w = (2 * Math.PI * Math.min(f, sampleRate * 0.45)) / sampleRate;
    const al = Math.sin(w) / (2 * Q);
    const c = Math.cos(w);
    const a0 = 1 + al;
    this.b0 = ((1 - c) / 2) / a0; this.b1 = (1 - c) / a0; this.b2 = ((1 - c) / 2) / a0;
    this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rpm", defaultValue: 800, minValue: 0, maxValue: 20000, automationRate: "k-rate" },
      { name: "throttle", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    const p = (this.p = options.processorOptions || {});
    this.mode = p.mode || "engine";
    this.idleRpm = p.idleRpm || 800;
    this.redlineRpm = p.redlineRpm || 7000;
    this.rpmSm = this.idleRpm;
    this.thrSm = 0;
    this.smoothK = Math.exp(-1 / (0.06 * sampleRate));

    if (this.mode === "engine") {
      const n = p.cylinders;
      const order = p.firingOrder;
      const bankOf = p.bankOf; // bankOf[cylinderNumber-1] -> 0|1
      // Firing events: evenly spaced crank angles assigned by firing order
      this.events = order.map((cyl, i) => ({
        angle: (i * 720) / n,
        bank: bankOf[cyl - 1],
        bias: (Math.random() * 2 - 1) * (p.ampJitter || 0.05), // per-cylinder spread
      }));
      this.crank = 0;
      this.evIdx = 0;
      this.env = [0, 0];
      this.noiseEnv = 0;
      this.thumpEnv = 0;
      // Two identical resonator banks (one per cylinder bank) = burble from
      // uneven per-bank firing intervals
      this.res = [0, 1].map(() => p.resonators.map(([f, q]) => new Biquad().bandpass(f, q)));
      this.resGain = p.resonators.map((r) => r[2]);
      this.thumpBq = new Biquad().bandpass(48, 1.1);
      this.popBq = new Biquad().bandpass(320, 2.2);
      this.subPhase = 0;
      // Turbo state
      this.boost = 0;
      this.whinePhase = 0;
      this.turboBq = new Biquad().bandpass(600, 1.1);
      this.bovBq = new Biquad().bandpass(1600, 1.4);
      this.bovEnv = 0;
      this.flutterPhase = 0;
      // Overrun crackle
      this.crackleEnv = 0;
      this.popEnv = 0;
      this.outLp = new Biquad().lowpass(7500, 0.7);
      this.envDecay = 0.999;
      this.noiseDecay = 0.999;
      this.thumpDecay = 0.999;
    } else {
      this.phases = [0, 0, 0, 0, 0];
      this.noiseBq = new Biquad().bandpass(this.mode === "ev" ? 6000 : 1200, 1.5);
      this.lfoPhase = 0;
      this.outLp = new Biquad().lowpass(9000, 0.7);
    }
  }

  process(inputs, outputs, params) {
    const out = outputs[0][0];
    const rpmT = params.rpm[0];
    const thrT = params.throttle[0];
    if (this.mode === "engine") this.renderEngine(out, rpmT, thrT);
    else this.renderMotor(out, rpmT, thrT);
    return true;
  }

  renderEngine(out, rpmT, thrT) {
    const p = this.p;
    const n = p.cylinders;
    const fs = sampleRate;
    // Block-rate housekeeping
    const rpm = Math.max(60, this.rpmSm);
    const firingSec = 120 / (n * rpm); // seconds between firings
    this.envDecay = Math.exp(-1 / (Math.max(1e-4, (p.pulseTau || 0.3) * firingSec) * fs));
    this.noiseDecay = Math.exp(-1 / (Math.max(1e-4, 0.55 * firingSec) * fs));
    this.thumpDecay = Math.exp(-1 / (Math.max(1e-4, 1.4 * firingSec) * fs));
    const turbo = p.turbo;
    if (turbo) this.turboBq.bandpass(380 + 3200 * Math.pow(this.boost, 0.7), 1.1);
    const rpmN = Math.min(1, Math.max(0, (rpm - this.idleRpm) / (this.redlineRpm - this.idleRpm)));
    // Overrun -> arm crackle
    if (thrT < 0.15 && rpmN > 0.25) this.crackleEnv = Math.max(this.crackleEnv, Math.min(1, rpmN + 0.3));
    const crackleDecay = Math.exp(-1 / (0.5 * fs));
    const popDecay = Math.exp(-1 / (0.012 * fs));
    const bovDecay = Math.exp(-1 / (0.32 * fs));

    for (let i = 0; i < out.length; i++) {
      this.rpmSm += (rpmT - this.rpmSm) * (1 - this.smoothK);
      this.thrSm += (thrT - this.thrSm) * (1 - this.smoothK);
      const thr = this.thrSm;
      const load = 0.3 + 0.7 * thr;

      // --- crank & firings ---
      this.crank += (this.rpmSm * 6) / fs;
      if (this.crank >= 720) {
        this.crank -= 720;
        this.evIdx = 0;
      }
      while (this.evIdx < this.events.length && this.crank >= this.events[this.evIdx].angle) {
        const ev = this.events[this.evIdx++];
        // Idle lope: low rpm + closed throttle -> occasional weak/skipped burns
        const idleness = Math.max(0, Math.min(1, 1.7 - this.rpmSm / this.idleRpm)) * Math.max(0, 1 - thr * 3);
        let burn = 0.78 + 0.22 * Math.random();
        if (Math.random() < (p.lope || 0) * idleness * 0.55) burn = 0.08 + 0.15 * Math.random();
        const amp = load * (1 + ev.bias) * (1 + (p.ampJitter || 0) * (Math.random() * 2 - 1));
        this.env[ev.bank] += amp * burn;
        this.noiseEnv += amp * (p.noiseMix || 0.2) * (1 + (1 - burn) * 1.8);
        this.thumpEnv += amp * Math.pow(burn, 1.6);
      }

      // --- excitation -> per-bank exhaust formants ---
      const wnA = Math.random() * 2 - 1;
      const wnB = Math.random() * 2 - 1;
      const xA = this.env[0] + this.noiseEnv * wnA * 0.7 + this.popEnv * wnA * 2.2;
      const xB = this.env[1] + this.noiseEnv * wnB * 0.7;
      let y = 0;
      for (let r = 0; r < this.resGain.length; r++) {
        y += this.resGain[r] * (this.res[0][r].process(xA) + this.res[1][r].process(xB));
      }
      y += (p.thumpGain || 0.5) * this.thumpBq.process(this.thumpEnv);
      y += this.popBq.process(this.popEnv * wnA) * 1.6;
      this.env[0] *= this.envDecay;
      this.env[1] *= this.envDecay;
      this.noiseEnv *= this.noiseDecay;
      this.thumpEnv *= this.thumpDecay;

      // --- sub octave (one octave below firing frequency) ---
      const fireHz = (this.rpmSm / 60) * (n / 2);
      this.subPhase += (2 * Math.PI * fireHz * 0.5) / fs;
      y += Math.sin(this.subPhase) * (p.subGain || 0) * (0.25 + 0.55 * load);

      // --- turbo: whine + compressor rush + blow-off flutter ---
      if (turbo) {
        const boostT = Math.max(0, Math.min(1, (thr - 0.22) * 1.5)) * Math.min(1, 0.25 + rpmN * 1.3);
        this.boost += (boostT - this.boost) / ((boostT > this.boost ? 0.55 : 0.28) * fs);
        this.boost = Math.max(0, Math.min(1, this.boost));
        if (thr < 0.18 && this.boost > 0.3 && this.bovEnv < 0.05) {
          this.bovEnv = this.boost; // psssh-tu-tu-tu
          this.boost *= 0.2;
        }
        const tHz = turbo.hz[0] + (turbo.hz[1] - turbo.hz[0]) * this.boost;
        this.whinePhase += (2 * Math.PI * tHz) / fs;
        y += Math.sin(this.whinePhase) * turbo.level * this.boost * this.boost;
        y += this.turboBq.process(wnB) * turbo.noise * Math.pow(this.boost, 1.4);
        if (this.bovEnv > 0.001) {
          this.flutterPhase += (2 * Math.PI * (turbo.flutterHz || 30)) / fs;
          const flutter = 1 - (turbo.flutterDepth || 0.6) * (0.5 + 0.5 * Math.sin(this.flutterPhase));
          y += this.bovBq.process(wnA) * this.bovEnv * (turbo.bov || 0.5) * flutter * 2.2;
          this.bovEnv *= bovDecay;
        }
      }

      // --- overrun crackle/burble pops ---
      if (this.crackleEnv > 0.01 && (p.crackle || 0) > 0) {
        if (Math.random() < (30 / fs) * this.crackleEnv * p.crackle) {
          this.popEnv += 0.4 + 0.6 * Math.random();
        }
        this.crackleEnv *= crackleDecay;
      }
      this.popEnv *= popDecay;

      // --- saturate (hardens under load) + final low-pass ---
      const drive = (p.drive || 1.6) + 1.8 * load;
      out[i] = this.outLp.process(Math.tanh(y * drive) * 0.5);
    }
  }

  renderMotor(out, rpmT, thrT) {
    const fs = sampleRate;
    for (let i = 0; i < out.length; i++) {
      this.rpmSm += (rpmT - this.rpmSm) * (1 - this.smoothK);
      this.thrSm += (thrT - this.thrSm) * (1 - this.smoothK);
      const rpmN = Math.min(1, Math.max(0, (this.rpmSm - this.idleRpm) / (this.redlineRpm - this.idleRpm)));
      const load = 0.3 + 0.7 * this.thrSm;
      const wn = Math.random() * 2 - 1;
      let y = 0;
      if (this.mode === "ev") {
        // Motor order whine + gear mesh + inverter hiss
        const f0 = (this.rpmSm / 60) * 10;
        this.phases[0] += (2 * Math.PI * f0) / fs;
        this.phases[1] += (2 * Math.PI * f0 * 2.02) / fs;
        this.phases[2] += (2 * Math.PI * f0 * 1.33) / fs;
        this.phases[3] += (2 * Math.PI * Math.max(24, f0 * 0.125)) / fs;
        y += Math.sin(this.phases[0]) * 0.5 * (0.25 + 0.75 * rpmN);
        y += Math.sin(this.phases[1]) * 0.22 * rpmN;
        y += Math.sin(this.phases[2]) * 0.16 * (0.3 + 0.7 * load);
        y += Math.sin(this.phases[3]) * 0.3; // low hum
        y += this.noiseBq.process(wn) * (0.06 + 0.22 * load * rpmN);
        y *= 0.28 + 0.72 * Math.min(1, rpmN * 2 + load * 0.5);
      } else {
        // Sci-fi warp: detuned cluster + shimmering noise swell
        const f = 55 + rpmN * 480;
        this.lfoPhase += (2 * Math.PI * 0.4) / fs;
        const shimmer = 1 + 0.18 * Math.sin(this.lfoPhase);
        this.phases[0] += (2 * Math.PI * f) / fs;
        this.phases[1] += (2 * Math.PI * f * 1.008) / fs;
        this.phases[2] += (2 * Math.PI * f * 0.993) / fs;
        this.phases[3] += (2 * Math.PI * f * 2.01) / fs;
        this.phases[4] += (2 * Math.PI * f * 3.02) / fs;
        y += (Math.sin(this.phases[0]) + Math.sin(this.phases[1]) + Math.sin(this.phases[2])) * 0.28;
        y += Math.sin(this.phases[3]) * 0.2 * (0.4 + 0.6 * load);
        y += Math.sin(this.phases[4]) * 0.1 * rpmN;
        this.noiseBq.bandpass(400 + 3400 * rpmN, 1.5);
        y += this.noiseBq.process(wn) * (0.1 + 0.35 * load);
        y *= shimmer;
      }
      out[i] = this.outLp.process(Math.tanh(y * 1.8) * 0.55);
    }
  }
}

registerProcessor("engine-processor", EngineProcessor);
