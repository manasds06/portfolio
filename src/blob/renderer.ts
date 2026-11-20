import { MAX_PIECES, type CutEvent, type Sim } from "./sim";

/**
 * Draws the pieces as one smooth-unioned solid, ray-marched in a fragment
 * shader with an orthographic camera. The cursor is the light. Everything
 * the shader receives is in CSS pixels, y down, matching the simulation.
 */

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
#define MAX ${MAX_PIECES}
#define MAXSEG 40
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_time;
uniform float u_spin;       // radians turned so far
uniform int u_count;
uniform vec3 u_ball[MAX];  // x, y, radius
uniform float u_k;         // smooth-union softness
uniform float u_zmax;
uniform vec3 u_light;      // direction to the lamp
uniform float u_open;      // 1 once a piece has swollen to fill the screen
uniform vec4 u_lean[MAX];  // per piece: unit direction toward the cursor (xyz), bulge (w)
uniform vec3 u_mouse;      // cursor x, y, and how present it is (0..1)
uniform vec4 u_flareA;     // the last cut line: ax, ay, bx, by
uniform float u_flareS;    // and how bright it still flares (0..1)
uniform vec4 u_seg[MAXSEG]; // the initials: rounded strokes from (x, y) to (z, w)
uniform int u_segCount;
uniform float u_segR;       // their half-thickness
uniform float u_form;       // 0 = pieces, 1 = the crisp letters
out vec4 outColor;

// the dot field behind the blob: faint pips that wake near the cursor and flare along a cut
vec3 field(vec2 px) {
  const float sp = 22.0;
  vec2 f = fract(px / sp) - 0.5;
  float pip = smoothstep(1.35, 0.35, length(f) * sp);
  float halo = u_mouse.z * exp(-pow(length(px - u_mouse.xy) / 150.0, 2.0)) * 0.5;
  vec2 pa = px - u_flareA.xy;
  vec2 ba = u_flareA.zw - u_flareA.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1.0), 0.0, 1.0);
  float flare = u_flareS * exp(-pow(length(pa - ba * h) / 70.0, 2.0)) * 0.6;
  // grey at rest; the cursor's halo and a cut's flare light them violet
  const vec3 violet = vec3(0.58, 0.2, 1.0);
  return pip * (vec3(0.05) + violet * (halo + flare) * 1.25) * (1.0 - u_open);
}

// a rounded stroke: distance to the segment, minus its half-thickness
float stroke(vec3 p, vec4 s) {
  vec2 pa = p.xy - s.xy;
  vec2 ba = s.zw - s.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0);
  return length(vec3(pa - ba * h, p.z)) - u_segR;
}

float letters(vec3 p) {
  // a smooth union: joins swell together like poured clay instead of meeting at a seam
  float k = u_segR * 0.7;
  float d = 1e6;
  for (int i = 0; i < MAXSEG; i++) {
    if (i >= u_segCount) break;
    float e = stroke(p, u_seg[i]);
    float h = clamp(0.5 + 0.5 * (e - d) / k, 0.0, 1.0);
    d = mix(e, d, h) - k * h * (1.0 - h);
  }
  return d;
}

float pieces(vec3 p);

float map(vec3 p) {
  float b = pieces(p);
  // mixing distances melts the pieces into the letters
  return u_form > 0.001 ? mix(b, letters(p), u_form) : b;
}

float pieces(vec3 p) {
  // log-sum-exp smooth minimum over every sphere, kept finite for huge radii
  float d[MAX];
  float m = 1e6;
  for (int i = 0; i < MAX; i++) {
    if (i >= u_count) break;
    vec3 q = p - vec3(u_ball[i].xy, 0.0);
    float lq = length(q);
    // the side facing the cursor swells a little, as if the blob were looking at you
    float lean = u_lean[i].w * pow(max(0.0, dot(q / max(lq, 1e-3), u_lean[i].xyz)), 3.0);
    d[i] = lq - u_ball[i].z - lean;
    m = min(m, d[i]);
  }
  float s = 0.0;
  for (int i = 0; i < MAX; i++) {
    if (i >= u_count) break;
    s += exp(-(d[i] - m) / u_k);
  }
  return m - u_k * log(s);
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.8, -0.8);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// smooth value noise in 3D
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

// The surface point in its own sphere's frame, turned over time, so the
// texture is painted on the ball and travels with it as it spins.
vec3 surfaceCoord(vec3 p) {
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float m = 1e6;
  for (int i = 0; i < MAX; i++) {
    if (i >= u_count) break;
    m = min(m, length(p - vec3(u_ball[i].xy, 0.0)) - u_ball[i].z);
  }
  for (int i = 0; i < MAX; i++) {
    if (i >= u_count) break;
    vec3 q = p - vec3(u_ball[i].xy, 0.0);
    float w = exp(-(length(q) - u_ball[i].z - m) / u_k);
    acc += q * w;
    wsum += w;
  }
  // turn about the upright axis so the near face travels left to right
  vec3 v = acc / wsum;
  float c = cos(u_spin), s = sin(u_spin);
  return vec3(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
  float grain = hash(gl_FragCoord.xy + fract(u_time) * 517.0) - 0.5;

  // cheap reject: nothing to march far outside every sphere
  float near = 1e6;
  for (int i = 0; i < MAX; i++) {
    if (i >= u_count) break;
    near = min(near, length(px - u_ball[i].xy) - u_ball[i].z - u_k * 3.0);
  }
  if (u_form > 0.001) near = min(near, letters(vec3(px, 0.0)) - 2.0);
  vec3 bg = field(px);
  if (near > 2.0) { outColor = vec4(bg, 1.0); return; }

  vec3 ro = vec3(px, u_zmax);
  float t = 0.0;
  float minD = 1e6;
  vec3 closest = ro;
  bool hit = false;
  for (int i = 0; i < 36; i++) {
    vec3 p = ro - vec3(0.0, 0.0, t);
    float d = map(p);
    if (d < minD) { minD = d; closest = p; }
    if (d < 0.25) { hit = true; closest = p; break; }
    t += d * 0.92;
    if (t > u_zmax * 2.0) break;
  }

  float cover = hit ? 1.0 : smoothstep(1.3, 0.0, minD);
  if (cover <= 0.0) { outColor = vec4(bg, 1.0); return; }

  vec3 n = normalAt(closest);
  float diff = dot(n, u_light);
  // long soft terminator, no highlight: a matte ball under one lamp
  float lit = pow(smoothstep(-0.2, 1.0, diff), 1.25);
  // cast concrete: sand-sized speckle, coarser aggregate, a few dark pits,
  // and a faint cloudiness from the pour
  vec3 sc = surfaceCoord(closest);
  float sand = noise(sc / 1.15) * 0.5 + noise(sc / 2.7) * 0.5;
  float cloud = noise(sc / 26.0);
  float pit = smoothstep(0.74, 0.9, noise(sc / 2.1 + 19.0));
  float tex = (sand - 0.5) * 0.52 + (cloud - 0.5) * 0.16 - pit * 0.2;
  float shade = 0.01 + lit * 0.66 * (1.0 + tex);
  shade += grain * (0.05 + shade * 0.16);

  // filling the screen, the surface dims so the cards on top can lead
  // a purple bounce light on the shadow side, as if a neon wall stood just
  // out of frame: strongest where the lamp doesn't reach, and along the rim
  vec3 surf = vec3(shade);
  float away = smoothstep(0.15, -0.7, diff);
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.5);
  surf += vec3(0.42, 0.12, 0.85) * (away * 0.07 + rim * away * 0.22) * (1.0 + tex * 0.6);
  vec3 col = surf * mix(1.0, 0.5, u_open) * cover + bg * (1.0 - cover);
  outColor = vec4(max(col, 0.0), 1.0);
}`;

export class Renderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private ball = new Float32Array(MAX_PIECES * 3);
  private lean = new Float32Array(MAX_PIECES * 4);
  private seg = new Float32Array(40 * 4);
  /** a lazier copy of the cursor that the blob "watches" */
  private mx = 0;
  private my = 0;
  private mOn = 0;
  private flareA: [number, number, number, number] = [-1e4, -1e4, -1e4, -1e4];
  private flareS = 0;
  dpr = 1;
  /** smoothed light position */
  private lx = 0;
  private ly = 0;
  private open = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader error");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link error");
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of ["u_res", "u_dpr", "u_time", "u_spin", "u_count", "u_ball", "u_k", "u_zmax", "u_light", "u_open", "u_lean", "u_mouse", "u_flareA", "u_flareS", "u_seg", "u_segCount", "u_segR", "u_form"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
  }

  resize(w: number, h: number) {
    // the grain hides the softness, so render well under retina to stay smooth
    this.dpr = Math.min(window.devicePixelRatio || 1, w * h > 1_300_000 ? 1.1 : 1.4);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.lx === 0 && this.ly === 0) {
      this.lx = w * 0.72;
      this.ly = h * 0.18;
    }
  }

  draw(sim: Sim, dt: number) {
    const gl = this.gl;
    const c = sim.cursor;
    const ease = (rate: number) => 1 - Math.exp(-rate * dt);

    // the lamp trails the cursor a little; with no cursor it hangs upper right
    // on a phone with no cursor, tilting the phone swings the lamp around instead
    const tilt = !c.active && sim.tilt;
    const tx = c.active ? c.x : tilt ? sim.w / 2 + sim.tilt!.x * sim.w * 0.55 : sim.w * 0.72;
    const ty = c.active ? c.y : tilt ? sim.h / 2 + sim.tilt!.y * sim.h * 0.55 : sim.h * 0.18;
    this.lx += (tx - this.lx) * ease(9);
    this.ly += (ty - this.ly) * ease(9);

    this.open += ((sim.opened !== null ? 1 : 0) - this.open) * ease(sim.opened !== null ? 3.2 : 7);

    // the watched cursor follows the real one lazily, and fades in and out
    const present = c.active && sim.opened === null ? 1 : 0;
    if (this.mOn < 0.01 && present) {
      this.mx = c.x;
      this.my = c.y;
    }
    this.mx += (c.x - this.mx) * ease(6);
    this.my += (c.y - this.my) * ease(6);
    this.mOn += (present - this.mOn) * ease(present ? 5 : 2.5);
    this.flareS *= Math.exp(-2.4 * dt);

    let zmax = 10;
    let count = 0;
    for (const p of sim.pieces) {
      if (p.r < 0.5 || count >= MAX_PIECES) continue;
      this.ball[count * 3] = p.x;
      this.ball[count * 3 + 1] = p.y;
      this.ball[count * 3 + 2] = p.r;
      // lean toward the cursor: strongest when it is near, nothing far away
      const vx = this.mx - p.x;
      const vy = this.my - p.y;
      const dist = Math.hypot(vx, vy);
      const near = 1 - Math.min(1, Math.max(0, (dist - p.r * 0.9) / (p.r * 2.6)));
      const centred = Math.min(1, dist / (p.r * 0.35 + 1));
      const amount = sim.calm ? 0 : p.r * 0.11 * near * near * centred * this.mOn;
      const dn = Math.hypot(vx, vy, p.r * 0.5) || 1;
      this.lean[count * 4] = vx / dn;
      this.lean[count * 4 + 1] = vy / dn;
      this.lean[count * 4 + 2] = (p.r * 0.5) / dn;
      this.lean[count * 4 + 3] = amount;
      zmax = Math.max(zmax, p.r * 1.25 + sim.k * 3);
      count++;
    }

    gl.uniform2f(this.u.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.u_dpr, this.dpr);
    gl.uniform1f(this.u.u_time, sim.time);
    // one clockwise turn every 40 seconds; still when motion is reduced
    gl.uniform1f(this.u.u_spin, sim.calm ? 0 : sim.time * ((Math.PI * 2) / 40));
    gl.uniform1i(this.u.u_count, count);
    gl.uniform3fv(this.u.u_ball, this.ball);
    gl.uniform1f(this.u.u_k, sim.k);
    gl.uniform1f(this.u.u_zmax, zmax);
    // the lamp is far away, in whatever direction the cursor is from the middle
    const span = Math.min(sim.w, sim.h) * 0.5;
    let ldx = (this.lx - sim.w / 2) / span;
    let ldy = (this.ly - sim.h / 2) / span;
    const lm = Math.hypot(ldx, ldy);
    if (lm > 1.6) {
      ldx *= 1.6 / lm;
      ldy *= 1.6 / lm;
    }
    const ln = Math.hypot(ldx, ldy, 0.8);
    gl.uniform3f(this.u.u_light, ldx / ln, ldy / ln, 0.8 / ln);
    gl.uniform1f(this.u.u_open, this.open);
    gl.uniform4fv(this.u.u_lean, this.lean);
    gl.uniform3f(this.u.u_mouse, this.mx, this.my, this.mOn);
    gl.uniform4f(this.u.u_flareA, ...this.flareA);
    gl.uniform1f(this.u.u_flareS, this.flareS);
    const segs = sim.formSegs;
    const n = Math.min(40, segs.length);
    for (let i = 0; i < n; i++) this.seg.set(segs[i], i * 4);
    gl.uniform4fv(this.u.u_seg, this.seg);
    gl.uniform1i(this.u.u_segCount, n);
    gl.uniform1f(this.u.u_segR, sim.formStroke);
    gl.uniform1f(this.u.u_form, n ? sim.formMix : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Light up the dot field along a cut. */
  flare(e: CutEvent) {
    this.flareA = [e.ax, e.ay, e.bx, e.by];
    this.flareS = e.split ? 1 : 0.5;
  }

  dispose() {
    this.gl.deleteProgram(this.prog);
  }
}
