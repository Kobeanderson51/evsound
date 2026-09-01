/*
 * EV Sound FX engine processor.
 *
 * "engine" mode — physically-inspired combustion model: a crank-angle timeline
 * (0-720deg per four-stroke cycle) fires each cylinder in its real firing
 * order. Every firing injects a decaying pressure pulse + combustion noise
 * into per-bank "exhaust formant" resonators (fixed-frequency bandpass
 * filters), so pitch comes from the firing rate while the timbre stays
 * anchored — like a real exhaust. Turbo whine/rush, blow-off flutter,
 * supercharger whine, engine-order sines, exhaust rasp, intake gulp, diesel
 * knock, anti-lag detonations, overrun crackle, idle lope and per-cylinder
 * jitter are layered on top.
 *
 * "fx" mode — data-driven additive synth (oscillator/noise layers with
 * filters + LFOs) for the EV / sci-fi voices, with kick swells and lift-off
 * hiss one-shots.
 */

class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  bandpass(f, Q) {
    const w = (2 * Math.PI * Math.max(10, Math.min(f, sampleRate * 0.45))) / sampleRate;
    const al = Math.sin(w) / (2 * Q);
    const c = Math.cos(w);
    const a0 = 1 + al;
    this.b0 = al / a0; this.b1 = 0; this.b2 = -al / a0;
    this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  lowpass(f, Q) {
    const w = (2 * Math.PI * Math.max(10, Math.min(f, sampleRate * 0.45))) / sampleRate;
    const al = Math.sin(w) / (2 * Q);
    const c = Math.cos(w);
    const a0 = 1 + al;
    this.b0 = ((1 - c) / 2) / a0; this.b1 = (1 - c) / a0; this.b2 = ((1 - c) / 2) / a0;
    this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  highpass(f, Q) {
    const w = (2 * Math.PI * Math.max(10, Math.min(f, sampleRate * 0.45))) / sampleRate;
    const al = Math.sin(w) / (2 * Q);
    const c = Math.cos(w);
    const a0 = 1 + al;
    this.b0 = ((1 + c) / 2) / a0; this.b1 = (-(1 + c)) / a0; this.b2 = ((1 + c) / 2) / a0;
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

function oscSample(type, phase) {
  const t = phase - Math.floor(phase); // 0..1
  switch (type) {
    case "saw": return t * 2 - 1;
    case "tri": return t < 0.5 ? t * 4 - 1 : 3 - t * 4;
    case "square": return t < 0.5 ? 1 : -1;
    default: return Math.sin(2 * Math.PI * t);
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
    this.prevThr = 0;

    if (this.mode === "engine") this.initEngine(p);
    else this.initFx(p);
  }

  initEngine(p) {
    const n = p.cylinders;
    const order = p.firingOrder;
    const bankOf = p.bankOf; // bankOf[cylinderNumber-1] -> 0|1
    // Firing events: evenly spaced crank angles assigned by firing order,
    // or explicit uneven angles (e.g. 45° V-twin "potato-potato")
    this.events = order.map((cyl, i) => ({
      angle: p.firingAngles ? p.firingAngles[i] : (i * 720) / n,
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
    this.thumpBq = new Biquad().bandpass(p.thumpHz || 48, 1.1);
    this.popBq = new Biquad().bandpass(320, 2.2);
    this.subPhase = 0;
    // Turbo state
    this.boost = 0;
    this.whinePhase = 0;
    this.turboBq = new Biquad().bandpass(600, 1.1);
    this.bovBq = new Biquad().bandpass(1600, 1.4);
    this.bovEnv = 0;
    this.flutterPhase = 0;
    // Supercharger
    this.scPhase = 0;
    this.scBq = new Biquad().bandpass(2200, 1.4);
    // Order stack (phase-locked engine-order sines)
    this.orderPhases = (p.orderStack || []).map(() => Math.random());
    // Rasp + intake
    this.raspBq1 = p.rasp ? new Biquad().bandpass(p.rasp.hz[0], 0.9) : null;
    this.raspBq2 = p.rasp ? new Biquad().bandpass(p.rasp.hz[1], 1.3) : null;
    this.intakeBq = p.intake ? new Biquad().bandpass(p.intake.hz, p.intake.q) : null;
    // Diesel knock
    this.knockBq = p.knock ? new Biquad().bandpass(p.knock.hz, p.knock.q) : null;
    this.knockBq2 = p.knock ? new Biquad().bandpass(p.knock.hz * 1.62, p.knock.q * 0.7) : null;
    this.knockEnv = 0;
    // Anti-lag
    this.alBq1 = p.antilag ? new Biquad().bandpass(1500, 1.2) : null;
    this.alBq2 = p.antilag ? new Biquad().bandpass(95, 1.0) : null;
    this.alEnv = 0;
    this.alFuel = 1;
    // Overrun crackle
    this.crackleEnv = 0;
    this.popEnv = 0;
    this.outLp = new Biquad().lowpass(7500, 0.7);
    this.envDecay = 0.999;
    this.noiseDecay = 0.999;
    this.thumpDecay = 0.999;
  }

  initFx(p) {
    this.layers = (p.layers || []).map((l) => ({
      spec: l,
      phase: Math.random(),
      lfoPhase: Math.random(),
      bq: l.filter ? new Biquad() : null,
      filtF: l.filter ? l.filter.f0 : 0,
    }));
    for (const l of this.layers) if (l.bq) this.applyFxFilter(l, l.spec.filter.f0);
    this.kickEnv = 0;
    this.kickBq = p.kick ? new Biquad().bandpass(p.kick.hz, p.kick.q) : null;
    this.hissEnv = 0;
    this.hissT = 0;
    this.hissBq = p.liftHiss ? new Biquad().bandpass(p.liftHiss.f0, 1.2) : null;
    this.outLp = new Biquad().lowpass(9000, 0.7);
  }

  applyFxFilter(l, f) {
    const { type, q } = l.spec.filter;
    if (type === "lp") l.bq.lowpass(f, q);
    else if (type === "hp") l.bq.highpass(f, q);
    else l.bq.bandpass(f, q);
    l.filtF = f;
  }

  process(inputs, outputs, params) {
    const out = outputs[0][0];
    const rpmT = params.rpm[0];
    const thrT = params.throttle[0];
    if (this.mode === "engine") this.renderEngine(out, rpmT, thrT);
    else this.renderFx(out, rpmT, thrT);
    return true;
  }

  renderEngine(out, rpmT, thrT) {
    const p = this.p;
    const n = p.cylinders;
    const fs = sampleRate;
    // Block-rate housekeeping
    const rpm = Math.max(60, this.rpmSm);
    const rpmN = Math.min(1, Math.max(0, (rpm - this.idleRpm) / (this.redlineRpm - this.idleRpm)));
    const firingSec = 120 / (n * rpm);
    // Pulse sharpens toward redline when pulseTauHigh is set (harder top end)
    const tauF = p.pulseTauHigh
      ? (p.pulseTau || 0.3) + (p.pulseTauHigh - (p.pulseTau || 0.3)) * rpmN
      : p.pulseTau || 0.3;
    this.envDecay = Math.exp(-1 / (Math.max(1e-4, tauF * firingSec) * fs));
    this.noiseDecay = Math.exp(-1 / (Math.max(1e-4, 0.55 * firingSec) * fs));
    this.thumpDecay = Math.exp(-1 / (Math.max(1e-4, 1.4 * firingSec) * fs));
    const turbo = p.turbo;
    if (turbo) this.turboBq.bandpass(380 + 3200 * Math.pow(this.boost, 0.7), 1.1);
    // Overrun -> arm crackle
    if (thrT < 0.15 && rpmN > 0.25) this.crackleEnv = Math.max(this.crackleEnv, Math.min(1, rpmN + 0.3));
    const crackleDecay = Math.exp(-1 / (0.5 * fs));
    const popDecay = Math.exp(-1 / (0.012 * fs));
    const bovDecay = Math.exp(-1 / (0.32 * fs));
    const knockDecay = Math.exp(-1 / (0.004 * fs));
    const alDecay = Math.exp(-1 / (0.055 * fs));
    const sc = p.supercharger;
    const stack = p.orderStack;

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
        if (p.knock) this.knockEnv += amp * burn * p.knock.level;
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

      // --- engine-order stack (phase-locked intake note, e.g. inline six) ---
      if (stack) {
        const revHz = this.rpmSm / 60;
        let so = 0;
        for (let k = 0; k < stack.length; k++) {
          const part = stack[k];
          this.orderPhases[k] += (revHz * part.o) / fs;
          const g = part.g * (1 - part.rise + part.rise * rpmN);
          so += Math.sin(2 * Math.PI * this.orderPhases[k]) * g;
        }
        y += so * (p.orderStackLevel || 0.08) * (0.25 + 0.75 * load);
      }

      // --- supercharger whine (roots blower, tied to crank speed) ---
      if (sc) {
        const scHz = (this.rpmSm / 60) * sc.ratio;
        this.scPhase += scHz / fs;
        const saw = (this.scPhase - Math.floor(this.scPhase)) * 2 - 1;
        y += this.scBq.process(saw) * sc.level * (0.2 + 0.8 * rpmN) * (0.4 + 0.6 * load);
      }

      // --- exhaust rasp under load ---
      if (p.rasp && thr > 0.05) {
        const lg = Math.pow(thr, p.rasp.loadPow);
        const rg = Math.min(1, rpmN / p.rasp.knee);
        y += (this.raspBq1.process(wnA) + this.raspBq2.process(wnB)) * p.rasp.level * lg * rg * 3;
      }

      // --- intake gulp gated by throttle ---
      if (p.intake) {
        y += this.intakeBq.process(wnB) * p.intake.level * thr * (0.3 + 0.7 * rpmN) * (0.4 + this.noiseEnv);
      }

      // --- diesel injector knock ---
      if (p.knock) {
        y += (this.knockBq.process(this.knockEnv * wnA) + this.knockBq2.process(this.knockEnv * wnB) * 0.6);
        this.knockEnv *= knockDecay;
      }

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

      // --- anti-lag detonations (fuel-limited pops on closed throttle) ---
      if (p.antilag) {
        const off = Math.max(0, 1 - thr * 4);
        if (thr > 0.4) this.alFuel += (1 - this.alFuel) / (0.5 * fs);
        else this.alFuel -= (this.alFuel * off) / (1.1 * fs);
        this.alFuel = Math.max(0, Math.min(1, this.alFuel));
        if (Math.random() < (p.antilag.rate * 300 / fs) * off * rpmN * this.alFuel) {
          this.alEnv += 0.6 + 0.6 * Math.random();
        }
        if (this.alEnv > 0.001) {
          y += (this.alBq1.process(wnA * this.alEnv) * 1.6 + this.alBq2.process(this.alEnv) * 2.4) * p.antilag.level;
          this.alEnv *= alDecay;
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

  renderFx(out, rpmT, thrT) {
    const p = this.p;
    const fs = sampleRate;
    const filtK = 1 - Math.exp(-1 / (0.05 * fs));
    // One-shot triggers at block rate
    if (p.kick && thrT - this.prevThr > 0.25 && this.kickEnv < 0.1) this.kickEnv = p.kick.gain;
    if (p.liftHiss && this.prevThr > 0.45 && thrT < 0.15 && this.hissEnv < 0.02) {
      const rpmN0 = Math.min(1, Math.max(0, (this.rpmSm - this.idleRpm) / (this.redlineRpm - this.idleRpm)));
      if (rpmN0 > 0.2) {
        this.hissEnv = p.liftHiss.gain;
        this.hissT = 0;
      }
    }
    this.prevThr = thrT;
    const kickDecay = p.kick ? Math.exp(-1 / (p.kick.decay * fs)) : 1;
    const hissDecay = p.liftHiss ? Math.exp(-1 / (p.liftHiss.dur * 0.6 * fs)) : 1;

    for (let i = 0; i < out.length; i++) {
      this.rpmSm += (rpmT - this.rpmSm) * (1 - this.smoothK);
      this.thrSm += (thrT - this.thrSm) * (1 - this.smoothK);
      const norm = Math.min(1, Math.max(0, (this.rpmSm - this.idleRpm) / (this.redlineRpm - this.idleRpm)));
      const loadX = this.thrSm;
      let y = 0;

      for (let k = 0; k < this.layers.length; k++) {
        const L = this.layers[k];
        const s = L.spec;
        let lfoV = 0;
        if (s.lfo) {
          L.lfoPhase += s.lfo.hz / fs;
          lfoV = Math.sin(2 * Math.PI * L.lfoPhase);
        }
        let sig;
        if (s.osc === "noise") {
          sig = Math.random() * 2 - 1;
        } else {
          let f = s.f0 + (s.f1 - s.f0) * norm;
          if (s.lfo && s.lfo.target === "freq") f *= 1 + s.lfo.depth * lfoV;
          L.phase += f / fs;
          sig = oscSample(s.osc, L.phase);
        }
        if (L.bq) {
          let ff = s.filter.f0 + (s.filter.f1 - s.filter.f0) * norm;
          if (s.lfo && s.lfo.target === "filter") ff *= 1 + s.lfo.depth * lfoV;
          // Smooth + only recompute when meaningfully changed (cheap)
          L.filtTarget = ff;
          if ((i & 63) === 0) {
            const nf = L.filtF + (ff - L.filtF) * Math.min(1, filtK * 64);
            if (Math.abs(nf - L.filtF) > 0.5) this.applyFxFilter(L, nf);
          }
          sig = L.bq.process(sig);
        }
        let g = s.g0 + (s.g1 - s.g0) * norm + (s.gLoad || 0) * loadX;
        if (s.lfo && s.lfo.target === "gain") g *= 1 + s.lfo.depth * lfoV;
        y += sig * g;
      }

      // Kick swell (throttle spike)
      if (this.kickEnv > 0.001) {
        y += this.kickBq.process(Math.random() * 2 - 1) * this.kickEnv;
        this.kickEnv *= kickDecay;
      }
      // Lift-off hiss: bandpass sweeps down over its duration
      if (this.hissEnv > 0.001) {
        this.hissT += 1 / fs;
        const prog = Math.min(1, this.hissT / p.liftHiss.dur);
        if ((i & 127) === 0) {
          const f = p.liftHiss.f0 + (p.liftHiss.f1 - p.liftHiss.f0) * prog;
          this.hissBq.bandpass(f, 1.2);
        }
        y += this.hissBq.process(Math.random() * 2 - 1) * this.hissEnv;
        this.hissEnv *= hissDecay;
      }

      out[i] = this.outLp.process(Math.tanh(y * 1.6) * 0.6);
    }
  }
}

registerProcessor("engine-processor", EngineProcessor);
