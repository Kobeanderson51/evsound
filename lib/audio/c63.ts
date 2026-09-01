/*
 * Mercedes C63 real-recording voice.
 *
 * The wav is a bank of short loops recorded at 13 RPM steps in three states
 * (on-load, coasting, neutral revving). We run one looping source per layer
 * and constant-power crossfade between the two nearest RPM layers, pitch-
 * shifting each at most ±22% so it always stays inside its natural range.
 */

type Layer = { start: number; duration: number; rpm: number };

export type C63Meta = {
  banks: { load: Layer[]; coast: Layer[]; neutral: Layer[] };
};

type LiveLayer = {
  def: Layer;
  src: AudioBufferSourceNode;
  gain: GainNode;
  target: number;
};

function findLayerPair(defs: Layer[], rpm: number) {
  let lo = 0;
  for (let i = 0; i < defs.length; i++) if (defs[i].rpm <= rpm) lo = i;
  const hi = Math.min(defs.length - 1, lo + 1);
  if (lo === hi) return { lo, hi, mix: 0 };
  const a = defs[lo].rpm;
  const b = defs[hi].rpm;
  const mix = Math.max(0, Math.min(1, Math.log(rpm / a) / Math.log(b / a)));
  return { lo, hi, mix };
}

export class C63Voice {
  private banks: Record<"load" | "coast" | "neutral", LiveLayer[]>;
  private bankGains: Record<"load" | "coast" | "neutral", GainNode>;
  private output: GainNode;
  private ctx: AudioContext;
  private loadSm = 0;

  constructor(ctx: AudioContext, buffer: AudioBuffer, meta: C63Meta, destination: AudioNode) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0; // faded in by the caller
    // Post EQ: rumble-safe highpass, warm body shelf, tame 2.2k harshness
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 25;
    hp.Q.value = 0.65;
    const body = ctx.createBiquadFilter();
    body.type = "lowshelf";
    body.frequency.value = 105;
    body.gain.value = 2.5;
    const harsh = ctx.createBiquadFilter();
    harsh.type = "peaking";
    harsh.frequency.value = 2200;
    harsh.Q.value = 0.75;
    harsh.gain.value = -1.5;
    this.output.connect(hp);
    hp.connect(body);
    body.connect(harsh);
    harsh.connect(destination);

    const mkBank = (defs: Layer[]) => {
      const bank: LiveLayer[] = defs.map((def) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.loopStart = def.start;
        src.loopEnd = def.start + def.duration;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        src.start(0, def.start + Math.random() * def.duration);
        return { def, src, gain, target: 0 };
      });
      return bank;
    };
    this.bankGains = {
      load: ctx.createGain(),
      coast: ctx.createGain(),
      neutral: ctx.createGain(),
    };
    this.banks = {
      load: mkBank(meta.banks.load),
      coast: mkBank(meta.banks.coast),
      neutral: mkBank(meta.banks.neutral),
    };
    for (const key of ["load", "coast", "neutral"] as const) {
      this.bankGains[key].gain.value = 0;
      for (const l of this.banks[key]) l.gain.connect(this.bankGains[key]);
      this.bankGains[key].connect(this.output);
    }
  }

  /** rpm absolute, throttle 0..1, revving = REV button held */
  update(rpm: number, throttle: number, revving: boolean) {
    const t = this.ctx.currentTime;
    this.loadSm += (throttle - this.loadSm) * 0.12;
    const idle = rpm < 880 && !revving;
    const load = Math.max(0, Math.min(1, this.loadSm * 1.25 - 0.1));
    let wLoad: number, wCoast: number, wNeutral: number;
    if (revving) {
      wNeutral = 1;
      wLoad = 0;
      wCoast = 0;
    } else if (idle) {
      // A single bank at idle avoids comb-filtering between takes
      wCoast = 1;
      wLoad = 0;
      wNeutral = 0;
    } else {
      wLoad = Math.sqrt(load);
      wCoast = Math.sqrt(1 - load);
      wNeutral = 0;
    }
    this.bankGains.load.gain.setTargetAtTime(wLoad, t, 0.12);
    this.bankGains.coast.gain.setTargetAtTime(wCoast, t, 0.12);
    this.bankGains.neutral.gain.setTargetAtTime(wNeutral, t, 0.08);

    for (const key of ["load", "coast", "neutral"] as const) {
      const bank = this.banks[key];
      if ((key === "load" && wLoad < 0.001) || (key === "coast" && wCoast < 0.001) || (key === "neutral" && wNeutral < 0.001)) {
        // Bank silent — just zero any lingering layer gains
        for (const l of bank) {
          if (l.target !== 0) {
            l.target = 0;
            l.gain.gain.setTargetAtTime(0, t, 0.1);
          }
        }
        continue;
      }
      const pair = findLayerPair(bank.map((l) => l.def), rpm);
      const wLo = pair.lo === pair.hi ? 1 : Math.cos((pair.mix * Math.PI) / 2);
      const wHi = pair.lo === pair.hi ? 0 : Math.sin((pair.mix * Math.PI) / 2);
      for (let i = 0; i < bank.length; i++) {
        const l = bank[i];
        const w = i === pair.lo ? wLo : i === pair.hi ? wHi : 0;
        if (Math.abs(w - l.target) > 0.003) {
          l.target = w;
          l.gain.gain.setTargetAtTime(w, t, 0.1);
        }
        if (w > 0) {
          const rate = Math.max(0.82, Math.min(1.22, rpm / l.def.rpm));
          l.src.playbackRate.setTargetAtTime(rate, t, 0.11);
        }
      }
    }
  }

  setGain(v: number, timeConstant = 0.1) {
    this.output.gain.setTargetAtTime(v, this.ctx.currentTime, timeConstant);
  }

  stop() {
    const t = this.ctx.currentTime;
    this.output.gain.setTargetAtTime(0, t, 0.15);
    const banks = this.banks;
    setTimeout(() => {
      for (const key of ["load", "coast", "neutral"] as const) {
        for (const l of banks[key]) {
          try {
            l.src.stop();
            l.src.disconnect();
            l.gain.disconnect();
          } catch {
            /* already stopped */
          }
        }
      }
      try {
        this.output.disconnect();
      } catch {
        /* noop */
      }
    }, 600);
  }
}
