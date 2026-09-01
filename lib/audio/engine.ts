import type { SoundProfile, SampleProfile, EngineProfile, FxProfile, C63Profile } from "./profiles";
import { C63Voice, type C63Meta } from "./c63";

type WorkletVoice = {
  kind: "worklet";
  profile: EngineProfile | FxProfile;
  node: AudioWorkletNode;
  voiceGain: GainNode;
};

type SampleVoice = {
  kind: "sample";
  profile: SampleProfile;
  src: AudioBufferSourceNode;
  voiceGain: GainNode;
};

type C63LiveVoice = {
  kind: "c63";
  profile: C63Profile;
  voice: C63Voice;
};

/** Soft-knee ceiling curve: transparent below ±0.9, saturates smoothly above */
function makeSoftCeilingCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const curve = new Float32Array(n);
  const knee = 0.9;
  const span = 1 - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = a <= knee ? x : Math.sign(x) * (knee + span * (1 - Math.exp(-(a - knee) / span)));
  }
  return curve;
}

/** Trim loop points to zero crossings so MP3 loops don't click at the seam */
function seamlessLoopPoints(buf: AudioBuffer): { start: number; end: number } {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let s = Math.floor(sr * 0.05); // skip encoder padding
  let e = data.length - Math.floor(sr * 0.05);
  while (s < e && !(data[s] <= 0 && data[s + 1] > 0)) s++;
  while (e > s + sr && !(data[e - 1] <= 0 && data[e] > 0)) e--;
  return { start: s / sr, end: e / sr };
}

export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: WorkletVoice | SampleVoice | C63LiveVoice | null = null;
  private sampleCache = new Map<string, AudioBuffer>();
  private metaCache = new Map<string, C63Meta>();
  private workletReady = false;
  private _volume = 0.8;
  private gearVolSm = 1;
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
      // Master chain: gain -> limiter -> soft ceiling -> speakers
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 8;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.008;
      limiter.release.value = 0.25;
      const ceiling = this.ctx.createWaveShaper();
      ceiling.curve = makeSoftCeilingCurve();
      ceiling.oversample = "2x";
      this.master.connect(limiter);
      limiter.connect(ceiling);
      ceiling.connect(this.ctx.destination);
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
    this.gearVolSm = 1;
    if (profile.kind === "engine" || profile.kind === "fx") await this.startWorklet(ctx, profile);
    else if (profile.kind === "sample") await this.startSample(ctx, profile);
    else await this.startC63(ctx, profile);
  }

  private async startWorklet(ctx: AudioContext, profile: EngineProfile | FxProfile) {
    if (!this.workletReady) {
      await ctx.audioWorklet.addModule("/engine-worklet.js");
      this.workletReady = true;
    }
    const node = new AudioWorkletNode(ctx, "engine-processor", {
      numberOfInputs: 0,
      outputChannelCount: [1],
      processorOptions: {
        ...profile.params,
        idleRpm: profile.idleRpm,
        redlineRpm: profile.redlineRpm,
      },
    });
    node.parameters.get("rpm")!.value = profile.idleRpm;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    node.connect(voiceGain);
    voiceGain.connect(this.master!);
    voiceGain.gain.setTargetAtTime(profile.baseGain, ctx.currentTime, 0.4);
    this.voice = { kind: "worklet", profile, node, voiceGain };
  }

  private async fetchBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    let buf = this.sampleCache.get(url);
    if (!buf) {
      const res = await fetch(url);
      buf = await ctx.decodeAudioData(await res.arrayBuffer());
      this.sampleCache.set(url, buf);
    }
    return buf;
  }

  private async startSample(ctx: AudioContext, profile: SampleProfile) {
    const buf = await this.fetchBuffer(ctx, profile.url);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const loop = seamlessLoopPoints(buf);
    src.loopStart = loop.start;
    src.loopEnd = loop.end;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    if (profile.lowshelf) {
      const shelf = ctx.createBiquadFilter();
      shelf.type = "lowshelf";
      shelf.frequency.value = profile.lowshelf.hz;
      shelf.gain.value = profile.lowshelf.db;
      src.connect(shelf);
      shelf.connect(voiceGain);
    } else {
      src.connect(voiceGain);
    }
    voiceGain.connect(this.master!);
    src.playbackRate.value = profile.rateRange[0];
    src.start(0, loop.start);
    voiceGain.gain.setTargetAtTime(profile.baseGain, ctx.currentTime, 0.4);
    this.voice = { kind: "sample", profile, src, voiceGain };
  }

  private async startC63(ctx: AudioContext, profile: C63Profile) {
    let meta = this.metaCache.get(profile.jsonUrl);
    if (!meta) {
      meta = (await (await fetch(profile.jsonUrl)).json()) as C63Meta;
      this.metaCache.set(profile.jsonUrl, meta);
    }
    const buf = await this.fetchBuffer(ctx, profile.wavUrl);
    const voice = new C63Voice(ctx, buf, meta, this.master!);
    voice.setGain(profile.baseGain, 0.4);
    this.voice = { kind: "c63", profile, voice };
  }

  /**
   * Called every animation frame.
   * @param rpm absolute rpm
   * @param throttle 0..1
   * @param gear current gear 1..6 (higher gears play slightly louder, like the road speed carrying the sound)
   * @param revving REV button held (stationary free-rev)
   */
  update(rpm: number, throttle: number, gear = 1, revving = false) {
    const v = this.voice;
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    const p = v.profile;
    const rpmNorm = Math.min(1, Math.max(0, (rpm - p.idleRpm) / (p.redlineRpm - p.idleRpm)));
    // Stability mode uses slower parameter ramps (more buffering, fewer clicks)
    const tau = this.stabilityMode ? 2.5 : 1;
    // Exterior boost: raise output at idle so it carries outside the cabin
    const boost = this.exteriorBoost ? 1.7 - 0.55 * rpmNorm : 1;
    // Gear volume: higher gears carry more road presence
    const continuous = p.kind === "fx" && (p as FxProfile).continuous;
    const gearVol = continuous ? 1 : 0.62 + 0.38 * ((revving ? 5 : gear - 1) / 5);
    this.gearVolSm += (gearVol - this.gearVolSm) * 0.06;

    if (v.kind === "worklet") {
      // The worklet smooths internally; setting .value is safe and zipper-free
      v.node.parameters.get("rpm")!.value = rpm;
      v.node.parameters.get("throttle")!.value = throttle;
      v.voiceGain.gain.setTargetAtTime(v.profile.baseGain * boost * this.gearVolSm, t, 0.1 * tau);
    } else if (v.kind === "sample") {
      const [r0, r1] = v.profile.rateRange;
      v.src.playbackRate.setTargetAtTime(r0 + (r1 - r0) * rpmNorm, t, 0.06 * tau);
      v.voiceGain.gain.setTargetAtTime(
        v.profile.baseGain * (0.55 + 0.25 * rpmNorm + 0.2 * throttle) * boost * this.gearVolSm,
        t,
        0.08 * tau
      );
    } else {
      v.voice.update(rpm, throttle, revving);
      v.voice.setGain(v.profile.baseGain * boost * this.gearVolSm, 0.1 * tau);
    }
  }

  stop() {
    const v = this.voice;
    if (!v || !this.ctx) return;
    if (v.kind === "c63") {
      v.voice.stop();
      this.voice = null;
      return;
    }
    const t = this.ctx.currentTime;
    v.voiceGain.gain.setTargetAtTime(0, t, 0.15);
    const cleanup = () => {
      try {
        if (v.kind === "worklet") v.node.disconnect();
        else v.src.stop();
        v.voiceGain.disconnect();
      } catch {
        /* already stopped */
      }
    };
    setTimeout(cleanup, 600);
    this.voice = null;
  }
}
