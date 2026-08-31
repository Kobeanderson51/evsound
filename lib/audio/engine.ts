import type { SoundProfile, SynthProfile, SampleProfile } from "./profiles";

function makeDistortionCurve(amount: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

type SynthVoice = {
  kind: "synth";
  profile: SynthProfile;
  oscs: { osc: OscillatorNode; gain: GainNode; mult: number; baseGain: number }[];
  noiseSrc: AudioBufferSourceNode;
  noiseGain: GainNode;
  noiseFilter: BiquadFilterNode;
  filter: BiquadFilterNode;
  voiceGain: GainNode;
};

type SampleVoice = {
  kind: "sample";
  profile: SampleProfile;
  src: AudioBufferSourceNode;
  voiceGain: GainNode;
};

export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: SynthVoice | SampleVoice | null = null;
  private sampleCache = new Map<string, AudioBuffer>();
  private _volume = 0.8;
  /** Louder at idle for outside/Bluetooth speakers */
  exteriorBoost = false;
  /** Extra smoothing/buffering for devices that crackle */
  stabilityMode = false;

  get running() {
    return this.voice !== null;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "playback" });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 8;
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this._volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  async start(profile: SoundProfile) {
    const ctx = this.ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    this.stop();
    if (profile.kind === "synth") this.startSynth(ctx, profile);
    else await this.startSample(ctx, profile);
  }

  private startSynth(ctx: AudioContext, profile: SynthProfile) {
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(profile.distortion) as Float32Array<ArrayBuffer>;
    shaper.oversample = "2x";

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = profile.filterBase;
    filter.Q.value = 1.2;

    shaper.connect(filter);
    filter.connect(voiceGain);
    voiceGain.connect(this.master!);

    const fireHz = (profile.idleRpm / 60) * (profile.cylinders / 2);
    const oscs = profile.harmonics.map((h) => {
      const osc = ctx.createOscillator();
      osc.type = h.type;
      osc.frequency.value = fireHz * h.mult;
      const gain = ctx.createGain();
      gain.gain.value = h.gain * 0.25;
      osc.connect(gain);
      gain.connect(shaper);
      osc.start();
      return { osc, gain, mult: h.mult, baseGain: h.gain };
    });

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = makeNoiseBuffer(ctx);
    noiseSrc.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 200;
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = profile.noiseGain;
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(shaper);
    noiseSrc.start();

    voiceGain.gain.setTargetAtTime(profile.baseGain, ctx.currentTime, 0.4);
    this.voice = { kind: "synth", profile, oscs, noiseSrc, noiseGain, noiseFilter, filter, voiceGain };
  }

  private async startSample(ctx: AudioContext, profile: SampleProfile) {
    let buf = this.sampleCache.get(profile.url);
    if (!buf) {
      const res = await fetch(profile.url);
      buf = await ctx.decodeAudioData(await res.arrayBuffer());
      this.sampleCache.set(profile.url, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    src.connect(voiceGain);
    voiceGain.connect(this.master!);
    src.playbackRate.value = profile.idleRpm / profile.baseRpm;
    src.start();
    voiceGain.gain.setTargetAtTime(profile.baseGain, ctx.currentTime, 0.4);
    this.voice = { kind: "sample", profile, src, voiceGain };
  }

  /** Called every animation frame with current rpm (absolute) and throttle 0..1 */
  update(rpm: number, throttle: number) {
    const v = this.voice;
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    const p = v.profile;
    const rpmNorm = Math.min(1, Math.max(0, (rpm - p.idleRpm) / (p.redlineRpm - p.idleRpm)));
    // Stability mode uses slower parameter ramps (more buffering, fewer clicks)
    const tau = this.stabilityMode ? 2.5 : 1;
    // Exterior boost: raise output at idle so it carries outside the cabin
    const boost = this.exteriorBoost ? 1.7 - 0.55 * rpmNorm : 1;

    if (v.kind === "synth") {
      const fireHz = (rpm / 60) * (v.profile.cylinders / 2);
      for (const o of v.oscs) {
        o.osc.frequency.setTargetAtTime(fireHz * o.mult, t, 0.03 * tau);
        const g = o.baseGain * (0.22 + 0.32 * rpmNorm + 0.3 * throttle);
        o.gain.gain.setTargetAtTime(g, t, 0.06 * tau);
      }
      const cutoff = v.profile.filterBase + v.profile.filterTrack * (rpmNorm * 0.75 + throttle * 0.45);
      v.filter.frequency.setTargetAtTime(cutoff, t, 0.05 * tau);
      v.noiseFilter.frequency.setTargetAtTime(120 + 900 * rpmNorm, t, 0.08 * tau);
      v.noiseGain.gain.setTargetAtTime(v.profile.noiseGain * (0.5 + rpmNorm + throttle * 0.8), t, 0.08 * tau);
      v.voiceGain.gain.setTargetAtTime(v.profile.baseGain * boost, t, 0.1 * tau);
    } else {
      v.src.playbackRate.setTargetAtTime(rpm / v.profile.baseRpm, t, 0.04 * tau);
      v.voiceGain.gain.setTargetAtTime(
        v.profile.baseGain * (0.6 + 0.25 * rpmNorm + 0.25 * throttle) * boost,
        t,
        0.08 * tau
      );
    }
  }

  stop() {
    const v = this.voice;
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.voiceGain.gain.setTargetAtTime(0, t, 0.15);
    const cleanup = () => {
      try {
        if (v.kind === "synth") {
          v.oscs.forEach((o) => o.osc.stop());
          v.noiseSrc.stop();
        } else {
          v.src.stop();
        }
        v.voiceGain.disconnect();
      } catch {
        /* already stopped */
      }
    };
    setTimeout(cleanup, 600);
    this.voice = null;
  }
}
