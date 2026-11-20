import type { CutEvent } from "./sim";

/**
 * Grains of sand shed by a cut. Each cut sprays grains off both faces of the
 * cut line; they drift, slow in the air, sink a little and fade out. Drawn on
 * a 2D canvas above the blob.
 */

interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  tone: number;
}

const MAX_GRAINS = 1400;

export class Dust {
  private grains: Grain[] = [];

  get count() {
    return this.grains.length;
  }

  spray(e: CutEvent) {
    const len = Math.hypot(e.bx - e.ax, e.by - e.ay);
    const tx = (e.bx - e.ax) / (len || 1);
    const ty = (e.by - e.ay) / (len || 1);
    // a clean cut sheds a lot, a graze a little
    const n = Math.min(260, Math.round(len * (e.split ? 0.9 : 0.45)));
    const push = 40 + Math.min(e.speed, 5000) * 0.03;
    for (let i = 0; i < n && this.grains.length < MAX_GRAINS; i++) {
      const u = Math.random();
      const side = Math.random() < 0.5 ? -1 : 1;
      const out = push * (0.3 + Math.random() * 0.9);
      const along = (Math.random() - 0.35) * push * 1.2;
      const max = 0.6 + Math.random() * 0.9;
      this.grains.push({
        x: e.ax + (e.bx - e.ax) * u + (Math.random() - 0.5) * 3,
        y: e.ay + (e.by - e.ay) * u + (Math.random() - 0.5) * 3,
        vx: e.nx * out * side + tx * along,
        vy: e.ny * out * side + ty * along,
        life: max,
        max,
        size: Math.random() < 0.85 ? 1 : 1.8,
        tone: 150 + Math.floor(Math.random() * 80),
      });
    }
  }

  step(dt: number) {
    const drag = Math.exp(-2.6 * dt);
    let w = 0;
    for (const g of this.grains) {
      g.life -= dt;
      if (g.life <= 0) continue;
      g.vx *= drag;
      g.vy = g.vy * drag + 26 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      this.grains[w++] = g;
    }
    this.grains.length = w;
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const g of this.grains) {
      const a = Math.min(1, g.life / g.max) * 0.85;
      ctx.fillStyle = `rgba(${g.tone},${g.tone},${g.tone - 6},${a.toFixed(3)})`;
      ctx.fillRect(g.x, g.y, g.size, g.size);
    }
  }
}
