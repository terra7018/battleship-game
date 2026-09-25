import { SOUNDS, SoundName } from './engine/sound';

/**
 * Web Audio synthesizer. The context is created lazily, on the first play() or
 * unmute that happens inside a user gesture, so autoplay policies are satisfied.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }

  /** Mutes or unmutes, including notes already scheduled. */
  set muted(value: boolean) {
    this._muted = value;
    if (this.master) this.master.gain.value = value ? 0 : 1;
  }

  /** Creates and resumes the context; call from a user gesture (e.g. the unmute click). */
  unlock(): void {
    const ctx = this.context();
    if (ctx) this.resume(ctx);
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null;
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  private resume(ctx: AudioContext): void {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  play(name: SoundName): void {
    if (this._muted) return;
    const ctx = this.context();
    if (!ctx || !this.master) return;
    this.resume(ctx);
    const start = ctx.currentTime + 0.01;
    for (const t of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.freq, start + t.at);
      osc.frequency.exponentialRampToValueAtTime(t.to, start + t.at + t.duration);
      gain.gain.setValueAtTime(t.gain, start + t.at);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + t.at + t.duration);
      osc.connect(gain).connect(this.master);
      osc.start(start + t.at);
      osc.stop(start + t.at + t.duration + 0.02);
    }
  }
}
