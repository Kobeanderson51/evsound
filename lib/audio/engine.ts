import type { SoundProfile, SampleProfile, EngineProfile } from "./profiles";

type WorkletVoice = {
  kind: "engine";
  profile: EngineProfile;
  node: AudioWorkletNode;
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
  private voice: WorkletVoice | SampleVoice | null = null;
  private sampleCache = new Map<string, AudioBuffer>();
  private workletReady = false;
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
    if (profile.kind === "engine") await this.startWorklet(ctx, profile);
    else await this.startSample(ctx, profile);
  }

  private async startWorklet(ctx: AudioContext, profile: EngineProfile) {
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
    this.voice = { kind: "engine", profile, node, voiceGain };
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

    if (v.kind === "engine") {
      // The worklet smooths internally; setting .value is safe and zipper-free
      v.node.parameters.get("rpm")!.value = rpm;
      v.node.parameters.get("throttle")!.value = throttle;
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
        if (v.kind === "engine") v.node.disconnect();
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
