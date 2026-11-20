/**
 * Blob physics, in CSS pixels and seconds.
 *
 * The blob is a set of spheres ("pieces") drawn as one smooth-unioned
 * solid. A fast swipe through a piece cuts it along the swipe line into
 * two spherical pieces whose volumes are the two caps the line made.
 * Left alone, pieces attract one another: each piece is pulled hardest
 * toward its host, the bigger piece that is nearest and heaviest, and the
 * biggest piece settles back to the middle. They fuse, small into large,
 * until one sphere is left. Volume is conserved
 * through every cut and every merge.
 *
 * The three sections ride along as tokens, so opening a section can swell
 * whichever piece holds it. The pieces themselves are not links.
 */

export const TOKENS = ["projects", "experience", "about"] as const;
export type Token = 0 | 1 | 2;

export const MAX_PIECES = 32;
/** ordinary slicing stops adding pieces here; only the initials use the rest */
const SLICE_PIECES = 16;

export interface Piece {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** volume, in px^3 / (4/3 pi): the radius it wants is cbrt(vol) */
  vol: number;
  /** drawn radius, easing toward cbrt(vol) */
  r: number;
  tokens: Token[];
  /** seconds since this piece was last cut or formed by a merge */
  age: number;
}

/** A cut, or a graze too thin to cut, for the dust to spray from. */
export interface CutEvent {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** unit normal pointing at the larger part */
  nx: number;
  ny: number;
  speed: number;
  /** false when the line only grazed off a sliver too thin to become a piece */
  split: boolean;
}

export interface Cursor {
  x: number;
  y: number;
  active: boolean;
}

const SUB = 1 / 120;
/** swipes slower than this through a piece just pass over it (px/s) */
const CUT_SPEED = 1000;
/** thinnest sliver a cut may shave off, as a share of the piece */
const MIN_SHARE = 0.03;
const MIN_RADIUS = 12;
/** fluid drag: velocity decays as exp(-DRAG * t) */
const DRAG = 1.35;
/**
 * A piece fresh from a cut flies free for a moment, then feels the pull at
 * full strength. The clock is the piece's own, so slicing one piece never
 * pauses the pull on the others.
 */
const FREE = 0.38;
const RAMP = 1.05;
/** a piece can't fuse until this old, or the two halves of a cut would re-fuse at once */
const FUSE_AGE = 0.35;
/** the initials form when a burst of slicing reaches this many pieces within FORM_WINDOW seconds */
const FORM_COUNT = 10;
const FORM_WINDOW = 6;
const FORM_HOLD = 3;
const FORM_K = 60;
const FORM_C = 9;
/** spring toward the host piece: the bigger piece nearest and heaviest */
const HOST_K = 2.3;
/** weaker pull toward every other piece, weighted by its share of the volume */
const MUTUAL_K = 0.75;
/** the biggest piece's pull back to the middle of the page */
const HOME_K = 0.6;
const RADIUS_EASE = 3.5;
/** share of speed kept when a piece bounces off a page edge */
const WALL_BOUNCE = 0.78;

export class Sim {
  pieces: Piece[] = [];
  w = 1;
  h = 1;
  /** radius of the whole, uncut blob */
  R0 = 100;
  /** smooth-union softness; the renderer uses the same number */
  k = 12;
  cursor: Cursor = { x: -9999, y: -9999, active: false };
  /** cuts since the renderer last took them */
  events: CutEvent[] = [];
  /** fusions since the page last took them, as the merged piece's share of the whole */
  fuses: number[] = [];
  /** phone tilt, -1..1 on each axis, or null with no gyroscope; the renderer aims the lamp with it */
  tilt: { x: number; y: number } | null = null;
  /** a hidden reward: slice fast enough and the pieces spell the initials for a moment */
  formUntil = 0;
  /** set once when the initials form, for the page to react to */
  formed = false;
  /** the blob ripples while an answer is on its way */
  thinking = false;
  private formTargets = new Map<number, { x: number; y: number }>();
  /** while spelling, every piece draws as the same small bead so the strokes read */
  private formBead = 0;
  /** the letters as rounded strokes, [ax, ay, bx, by] each, and their half-thickness */
  formSegs: [number, number, number, number][] = [];
  formStroke = 0;
  /** 0 = pieces, 1 = the crisp letters; eased so one melts into the other */
  formMix = 0;
  private formStart = 0;
  /** true while formInitials breaks pieces up, so the cap lets it reach MAX_PIECES */
  private spelling = false;
  private formCooldown = 0;
  private burstStart = 0;
  opened: Token | null = null;
  time = 0;
  calm = false;
  private acc = 0;
  private nextId = 1;
  private last: { x: number; y: number; t: number } | null = null;
  private entries = new Map<number, { x: number; y: number; t: number }>();
  private openId = -1;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.measure();
    this.pieces = [this.make(w / 2, h / 2, this.R0 ** 3, [0, 1, 2])];
    this.pieces[0].age = 1;
  }

  private measure() {
    this.R0 = Math.min(this.w, this.h) * 0.27;
    this.k = this.R0 * 0.085;
  }

  private make(x: number, y: number, vol: number, tokens: Token[]): Piece {
    return { id: this.nextId++, x, y, vx: 0, vy: 0, vol, r: Math.cbrt(vol), tokens, age: 0 };
  }

  resize(w: number, h: number) {
    const old = this.R0;
    const sx = w / this.w;
    const sy = h / this.h;
    this.w = w;
    this.h = h;
    this.measure();
    const s = this.R0 / old;
    for (const p of this.pieces) {
      p.x *= sx;
      p.y *= sy;
      p.vol *= s ** 3;
      p.r *= s;
    }
  }

  pieceAt(x: number, y: number): Piece | null {
    let best: Piece | null = null;
    for (const p of this.pieces) {
      if (Math.hypot(x - p.x, y - p.y) < p.r && (!best || p.r < best.r)) best = p;
    }
    return best;
  }

  holder(t: Token): Piece | undefined {
    return this.pieces.find((p) => p.tokens.includes(t));
  }

  /* ───────────── cutting ───────────── */

  /**
   * Feed every pointer position, button or no button. A segment that
   * passes through a piece fast enough cuts it. Returns the cuts made.
   */
  pointer(x: number, y: number, t: number): number {
    const prev = this.last;
    this.last = { x, y, t };
    if (!prev || this.opened !== null || t - prev.t > 0.12 || this.time < this.formUntil) {
      this.entries.clear();
      return 0;
    }
    let cuts = 0;
    for (const p of [...this.pieces]) {
      // one swipe, one cut: a piece that was just made can't be cut again by the same stroke
      if (p.age < 0.3) continue;
      const was = Math.hypot(prev.x - p.x, prev.y - p.y) < p.r;
      const now = Math.hypot(x - p.x, y - p.y) < p.r;
      const hit = this.crossings(p, prev.x, prev.y, x, y);

      if (!was && now && hit) {
        this.entries.set(p.id, { x: hit.ax, y: hit.ay, t: prev.t + (t - prev.t) * hit.ta });
      } else if (was && !now) {
        const entry = this.entries.get(p.id);
        this.entries.delete(p.id);
        if (entry && hit) {
          const speed = Math.hypot(hit.bx - entry.x, hit.by - entry.y) / Math.max(1 / 500, prev.t + (t - prev.t) * hit.tb - entry.t);
          if (this.cut(p, entry.x, entry.y, hit.bx, hit.by, speed)) cuts++;
        }
      } else if (!was && !now && hit && hit.ta >= 0 && hit.tb <= 1) {
        // went clean through between two samples
        const speed = Math.hypot(x - prev.x, y - prev.y) / Math.max(1 / 500, t - prev.t);
        if (this.cut(p, hit.ax, hit.ay, hit.bx, hit.by, speed)) cuts++;
      }
    }
    return cuts;
  }

  pointerGone() {
    this.last = null;
    this.entries.clear();
  }

  /** Where the line through two points meets the piece's circle, as segment parameters. */
  private crossings(p: Piece, x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const a = dx * dx + dy * dy;
    if (a < 1e-6) return null;
    const fx = x0 - p.x;
    const fy = y0 - p.y;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - p.r * p.r;
    const disc = b * b - 4 * a * c;
    if (disc <= 0) return null;
    const s = Math.sqrt(disc);
    const ta = (-b - s) / (2 * a);
    const tb = (-b + s) / (2 * a);
    return { ta, tb, ax: x0 + dx * ta, ay: y0 + dy * ta, bx: x0 + dx * tb, by: y0 + dy * tb };
  }

  private cut(p: Piece, ax: number, ay: number, bx: number, by: number, speed: number): boolean {
    if (speed < CUT_SPEED) return false;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 2) return false;
    const tx = (bx - ax) / len;
    const ty = (by - ay) / len;
    // unit normal pointing from the chord toward the centre: the big side
    let nx = -ty;
    let ny = tx;
    const off = (p.x - ax) * nx + (p.y - ay) * ny;
    if (off < 0) {
      nx = -nx;
      ny = -ny;
    }
    const R = p.r;
    const d = Math.min(Math.abs(off), R);
    // the small side is a spherical cap of height R - d
    const cap = R - d;
    const share = (cap * cap * (3 * R - cap)) / (4 * R * R * R);
    const done = this.split(p, nx, ny, share, 170 + Math.min(speed, 6000) * 0.022);
    if (this.events.length < 32) this.events.push({ ax, ay, bx, by, nx, ny, speed, split: done });
    return done;
  }

  /**
   * Divide a piece in two along a plane with unit normal (nx, ny) pointing
   * at the larger part. `share` is the smaller part's fraction of the volume.
   */
  private split(p: Piece, nx: number, ny: number, share: number, kick: number): boolean {
    const volS = p.vol * share;
    const volL = p.vol - volS;
    if (share < MIN_SHARE || Math.cbrt(volS) < MIN_RADIUS) return false;
    // never refuse a cut for being full: make room by fusing the two smallest others
    if (!this.spelling && this.pieces.length >= SLICE_PIECES) {
      const rest = this.pieces.filter((q) => q !== p).sort((a, b) => a.vol - b.vol);
      if (rest.length < 2) return false;
      this.fuse(rest[0], rest[1]);
    }

    // hand out the sections: a decent-sized small part takes one
    let small: Token[] = [];
    let large: Token[] = p.tokens;
    if (p.tokens.length > 1 && share > 0.12) {
      small = [p.tokens[0]];
      large = p.tokens.slice(1);
    }

    const rS = Math.cbrt(volS);
    const rL = Math.cbrt(volL);
    // start them overlapped about their shared centre of mass, so the
    // silhouette barely changes on the frame of the cut
    const gap = (rS + rL) * 0.42;
    const a = this.make(p.x - nx * gap * (1 - share), p.y - ny * gap * (1 - share), volS, small);
    const b = this.make(p.x + nx * gap * share, p.y + ny * gap * share, volL, large);
    // equal and opposite momentum
    a.vx = p.vx - nx * kick * (1 - share) * 2;
    a.vy = p.vy - ny * kick * (1 - share) * 2;
    b.vx = p.vx + nx * kick * share * 2;
    b.vy = p.vy + ny * kick * share * 2;

    if (this.pieces.length === 1) this.burstStart = this.time;
    this.pieces.splice(this.pieces.indexOf(p), 1, a, b);
    if (this.pieces.length >= FORM_COUNT && this.time - this.burstStart < FORM_WINDOW && this.time > this.formCooldown) this.formInitials();
    this.entries.delete(p.id);
    return true;
  }

  /* ───────────── intents ───────────── */

  open(t: Token | null) {
    if (t !== null) {
      const p = this.holder(t);
      this.openId = p ? p.id : -1;
    } else if (this.opened !== null) {
      // coming back: one whole blob, shrinking down from the full screen
      const big = this.pieces.find((p) => p.id === this.openId);
      const whole = this.make(this.w / 2, this.h / 2, this.R0 ** 3, [0, 1, 2]);
      whole.r = big ? big.r : this.R0;
      this.pieces = [whole];
    }
    this.opened = t;
    this.entries.clear();
  }

  /** Pull everything back into one blob right away. */
  gather() {
    for (const p of this.pieces) p.age = Math.max(p.age, 5);
  }

  /* ───────────── stepping ───────────── */

  step(dt: number) {
    this.acc += Math.min(dt, 0.05);
    while (this.acc >= SUB) {
      this.substep(SUB);
      this.acc -= SUB;
    }
  }

  private substep(dt: number) {
    this.time += dt;
    const cx = this.w / 2;
    const cy = this.h / 2;

    if (this.opened !== null) {
      const full = Math.hypot(this.w, this.h) * 0.66;
      for (const p of this.pieces) {
        const mine = p.id === this.openId;
        const target = mine ? full : 0;
        p.r += (target - p.r) * (1 - Math.exp(-(mine ? 3.4 : 9) * dt));
        if (mine) {
          p.x += (cx - p.x) * (1 - Math.exp(-5 * dt));
          p.y += (cy - p.y) * (1 - Math.exp(-5 * dt));
        }
      }
      return;
    }

    const drag = Math.exp(-DRAG * dt);

    const forming = this.time < this.formUntil;
    // short of 1, so the pieces still bulge through the strokes: soft, but the letters read
    const wantMix = forming && this.time - this.formStart > 0.35 ? 0.8 : 0;
    this.formMix += (wantMix - this.formMix) * (1 - Math.exp(-(wantMix ? 9 : 6) * dt));
    if (!forming && this.formMix < 0.002) {
      this.formMix = 0;
      this.formSegs = [];
    }
    const ps = this.pieces;
    let total = 0;
    let biggest = ps[0];
    for (const p of ps) {
      total += p.vol;
      if (p.vol > biggest.vol) biggest = p;
    }

    for (const p of ps) {
      p.age += dt;
      // a slow float, so nothing ever hangs perfectly still
      let ax = this.calm ? 0 : Math.sin(this.time * 0.45 + p.id * 1.9) * 5;
      let ay = this.calm ? 0 : Math.cos(this.time * 0.38 + p.id * 2.7) * 5;

      const target = forming ? this.formTargets.get(p.id) : undefined;
      if (target) {
        // spelling the initials: a stiff spring to its place in the letters
        ax += FORM_K * (target.x - p.x) - FORM_C * p.vx;
        ay += FORM_K * (target.y - p.y) - FORM_C * p.vy;
      }
      const ramp = Math.min(1, Math.max(0, (p.age - FREE) / RAMP));
      const pull = ramp * ramp;
      if (pull > 0 && !forming) {
        if (p === biggest) {
          ax -= HOME_K * pull * (p.x - cx);
          ay -= HOME_K * pull * (p.y - cy);
        } else {
          // the host: of the pieces bigger than this one, the one with the
          // strongest pull, mass over distance squared, so near and big wins
          let host = biggest;
          let best = -1;
          for (const q of ps) {
            if (q === p || q.vol <= p.vol) continue;
            const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + 1;
            const g = q.vol / d2;
            if (g > best) {
              best = g;
              host = q;
            }
          }
          ax += HOST_K * pull * (host.x - p.x);
          ay += HOST_K * pull * (host.y - p.y);
        }
        // and every piece tugs gently on every other, the heavier the harder
        for (const q of ps) {
          if (q === p) continue;
          const share = q.vol / total;
          ax += MUTUAL_K * pull * share * (q.x - p.x);
          ay += MUTUAL_K * pull * share * (q.y - p.y);
        }
      }

      p.vx = (p.vx + ax * dt) * drag;
      p.vy = (p.vy + ay * dt) * drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // the page edges are walls: the whole sphere stays inside and bounces off them
      const loX = Math.min(p.r, this.w / 2);
      const hiX = Math.max(this.w - p.r, this.w / 2);
      const loY = Math.min(p.r, this.h / 2);
      const hiY = Math.max(this.h - p.r, this.h / 2);
      if (p.x < loX) {
        p.x = loX;
        if (p.vx < 0) p.vx *= -WALL_BOUNCE;
      } else if (p.x > hiX) {
        p.x = hiX;
        if (p.vx > 0) p.vx *= -WALL_BOUNCE;
      }
      if (p.y < loY) {
        p.y = loY;
        if (p.vy < 0) p.vy *= -WALL_BOUNCE;
      } else if (p.y > hiY) {
        p.y = hiY;
        if (p.vy > 0) p.vy *= -WALL_BOUNCE;
      }

      // while spelling, pieces draw slimmer so the letters read
      const ripple = this.thinking && !this.calm ? 1 + 0.05 * Math.sin(this.time * 7 + p.id * 1.7) : 1;
      const want = (forming && this.formBead ? this.formBead : Math.cbrt(p.vol)) * ripple;
      p.r += (want - p.r) * (1 - Math.exp(-(forming ? 9 : RADIUS_EASE) * dt));
    }

    if (!forming && this.formTargets.size) {
      // the letters let go: pieces count as settled so they pull home at once
      this.formTargets.clear();
      for (const p of this.pieces) p.age = Math.max(p.age, FREE + RAMP * 0.5);
    }

    // fusing: once the smaller sits well inside the larger, they are one
    if (!forming) {
      for (let i = 0; i < this.pieces.length; i++) {
        for (let j = i + 1; j < this.pieces.length; j++) {
          const a = this.pieces[i];
          const b = this.pieces[j];
          const big = Math.max(a.r, b.r);
          const small = Math.min(a.r, b.r);
          if (a.age > FUSE_AGE && b.age > FUSE_AGE && Math.hypot(a.x - b.x, a.y - b.y) < big - small * 0.1) {
            this.fuse(a, b);
            j = i;
          }
        }
      }
    }
  }

  /** Lay the pieces out along the strokes of "MS" and hold them there for a moment. */
  private formInitials() {
    this.formCooldown = this.time + FORM_HOLD + 8;
    // letters need beads: break the biggest pieces in half until the set is full
    this.spelling = true;
    while (this.pieces.length < MAX_PIECES) {
      const big = this.pieces.reduce((m, q) => (q.vol > m.vol ? q : m));
      const a = Math.random() * Math.PI * 2;
      if (!this.split(big, Math.cos(a), Math.sin(a), 0.5, 0)) break;
    }
    this.spelling = false;
    // M, D and S as stroke paths in a unit box (y down), then laid out across the middle
    const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): [number, number][] =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
        return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number];
      });
    const letters: { w: number; pts: [number, number][] }[] = [
      { w: 0.84, pts: [[0, 1], [0, 0], [0.42, 0.6], [0.84, 0], [0.84, 1]] },
      { w: 0.74, pts: [[0, 1], [0, 0], [0.3, 0], ...arc(0.3, 0.5, 0.44, 0.5, -90, 90, 10).slice(1), [0, 1]] },
      { w: 0.66, pts: [...arc(0.33, 0.255, 0.31, 0.255, -25, -270, 9), ...arc(0.33, 0.745, 0.31, 0.255, -90, 155, 9).slice(1)] },
    ];
    // optical spacing, not equal boxes: two straight stems facing each other (M|D) need
    // more room than two curves (D)(S), whose open sides already read as space
    const gaps = [0.4, 0.31];
    const unitW = letters.reduce((acc, l) => acc + l.w, 0) + gaps.reduce((acc, g) => acc + g, 0);
    const h = Math.min(this.h * 0.36, (this.w * 0.84) / unitW);
    let x = this.w / 2 - (unitW * h) / 2;
    const y0 = this.h / 2 - h / 2;
    const strokes = letters.map((l, i) => {
      const pts = l.pts.map(([px, py]) => [x + px * h, y0 + py * h]);
      x += (l.w + (gaps[i] ?? 0)) * h;
      return pts;
    });
    // the crisp letters themselves: one rounded stroke per straight piece of each path
    this.formSegs = strokes.flatMap((pts) => pts.slice(1).map((q, i) => [pts[i][0], pts[i][1], q[0], q[1]] as [number, number, number, number]));
    this.formStroke = h * 0.11;
    this.formStart = this.time;
    const lengths = strokes.map((pts) => pts.slice(1).reduce((acc, q, i) => acc + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0));
    const total = lengths.reduce((acc, l) => acc + l, 0);
    const n = this.pieces.length;
    // beads ride along the strokes on the way in; the letters take over once they arrive
    this.formBead = (total / Math.max(1, n - lengths.length)) * 0.56;
    const counts = lengths.map((l) => Math.max(2, Math.round((n * l) / total)));
    counts[counts.length - 1] += n - counts.reduce((acc, c) => acc + c, 0);
    const targets: { x: number; y: number }[] = [];
    strokes.forEach((pts, si) => {
      const k = counts[si];
      for (let i = 0; i < k; i++) {
        let d = (lengths[si] * i) / Math.max(1, k - 1);
        for (let j = 1; j < pts.length; j++) {
          const seg = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
          if (d <= seg || j === pts.length - 1) {
            const u = seg ? Math.min(1, d / seg) : 0;
            targets.push({ x: pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, y: pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u });
            break;
          }
          d -= seg;
        }
      }
    });
    // each place takes the nearest piece still free, so nobody crosses the screen
    const free = [...this.pieces];
    this.formTargets.clear();
    for (const t of targets) {
      let bi = 0;
      for (let i = 1; i < free.length; i++) {
        if (Math.hypot(free[i].x - t.x, free[i].y - t.y) < Math.hypot(free[bi].x - t.x, free[bi].y - t.y)) bi = i;
      }
      const [p] = free.splice(bi, 1);
      if (p) this.formTargets.set(p.id, t);
    }
    this.formUntil = this.time + FORM_HOLD;
    this.formCooldown = this.time + FORM_HOLD + 8;
    this.formed = true;
  }

  private fuse(a: Piece, b: Piece) {
    const vol = a.vol + b.vol;
    const wa = a.vol / vol;
    const wb = b.vol / vol;
    const m = this.make(a.x * wa + b.x * wb, a.y * wa + b.y * wb, vol, [...a.tokens, ...b.tokens].sort() as Token[]);
    m.vx = a.vx * wa + b.vx * wb;
    m.vy = a.vy * wa + b.vy * wb;
    // begin at the size the pair already looked, then swell to the true radius
    m.r = Math.max(a.r, b.r);
    // a fused piece can be cut again at once
    m.age = 1;
    this.pieces = this.pieces.filter((p) => p !== a && p !== b);
    this.pieces.push(m);
    this.fuses.push(vol / this.R0 ** 3);
  }
}
