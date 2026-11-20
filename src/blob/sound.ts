/**
 * Small synthesized sounds, no audio files: a soft cut, a low thud when
 * pieces fuse, and a tick when a dot catches the cursor. Off until the
 * visitor turns it on (browsers only allow audio after a click anyway).
 */

const KEY = "blob-sound";

export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  on = false;

  constructor() {
    try {
      this.on = localStorage.getItem(KEY) === "on";
    } catch {
      /* private mode: stays off */
    }
  }

  /** Must run inside a click: browsers start audio only after a gesture. */
  setOn(on: boolean) {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (on) this.wake();
  }

  /** Resume the audio context; safe to call on any user gesture. */
  wake() {
    if (!this.on) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.55;
      this.out.connect(this.ctx.destination);
      // half a second of white noise, reused by every cut
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private ready() {
    return this.on && this.ctx && this.out && this.ctx.state === "running" ? this.ctx : null;
  }

  /** A swish through sand: band-passed noise sweeping down. Faster cuts are brighter. */
  cut(speed: number, split: boolean) {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    const top = 2400 + Math.min(speed, 5000) * 0.5;
    bp.frequency.setValueAtTime(top, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    const g = ctx.createGain();
    const peak = split ? 0.32 : 0.14;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    src.connect(bp).connect(g).connect(this.out!);
    src.start(t, Math.random() * 0.2, 0.3);
  }

  /** A soft low thud; bigger merges sound deeper. */
  fuse(size: number) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const f = 140 - Math.min(1, size) * 70;
    osc.frequency.setValueAtTime(f * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  /** A short, quiet tick when a dot catches the cursor. */
  tick() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(1100, t + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.06);
  }
}
