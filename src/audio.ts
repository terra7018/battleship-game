import { SOUNDS, SoundName } from './engine/sound';

/** Web Audio synthesizer; the context is created lazily on the first play() after a user gesture. */
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null;
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    return this.ctx;
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const start = ctx.currentTime + 0.01;
    for (const t of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.freq, start + t.at);
      osc.frequency.exponentialRampToValueAtTime(t.to, start + t.at + t.duration);
      gain.gain.setValueAtTime(t.gain, start + t.at);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + t.at + t.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + t.at);
      osc.stop(start + t.at + t.duration + 0.02);
    }
  }
}
