"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sim, TOKENS, type Token } from "@/blob/sim";
import { Renderer } from "@/blob/renderer";
import { Dust } from "@/blob/dust";
import { Sound } from "@/blob/sound";
import AskBlob from "./AskBlob";
import Cards from "./Cards";
import { SITE } from "@/content/site";

const LABELS = ["Projects", "Experience", "About"];

/** What can be open: one of the three sections, or the contact card on its own. */
export type Opened = Token | "contact";

function fromHash(): Opened | null {
  const h = window.location.hash.slice(1);
  if (h === "contact") return "contact";
  const i = TOKENS.indexOf(h as (typeof TOKENS)[number]);
  return i >= 0 ? (i as Token) : null;
}

// contact has no piece of its own; the piece holding About swells for it
const pieceFor = (o: Opened): Token => (o === "contact" ? 2 : o);

export default function BlobHome() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [open, setOpen] = useState<Opened | null>(null);
  const [noGl, setNoGl] = useState(false);

  /* open / close, kept in step with the URL hash so Back works */
  const show = useCallback((t: Opened | null, push = true) => {
    simRef.current?.open(t === null ? null : pieceFor(t));
    setOpen(t);
    if (push) {
      const url = t === null ? window.location.pathname : `#${t === "contact" ? "contact" : TOKENS[t]}`;
      window.history.pushState(null, "", url);
    }
  }, []);

  useEffect(() => {
    const onPop = () => show(fromHash(), false);
    const onKey = (e: KeyboardEvent) => {
      // with cards open, the card stack handles Escape itself
      if (e.key === "Escape" && simRef.current?.opened !== null && !document.querySelector(".cards")) show(null);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  useEffect(() => {
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const trail = trailRef.current!;
    const ring = cursorRef.current!;
    const sim = new Sim(window.innerWidth, window.innerHeight);
    sim.calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    simRef.current = sim;
    (window as unknown as { __sim: Sim }).__sim = sim;

    let renderer: Renderer | null = null;
    try {
      renderer = new Renderer(canvas);
    } catch {
      window.setTimeout(() => setNoGl(true), 0);
    }

    const tctx = trail.getContext("2d");
    const dust = new Dust();
    const sound = new Sound();
    soundRef.current = sound;
    window.setTimeout(() => setSoundOn(sound.on), 0);

    // phones: tilting the phone swings the lamp (iOS asks permission on the first touch)
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      sim.tilt = { x: clamp(e.gamma / 35), y: clamp((e.beta - 45) / 35) };
    };
    let tiltAsked = false;
    const askTilt = () => {
      if (tiltAsked) return;
      tiltAsked = true;
      const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
      if (D?.requestPermission) {
        D.requestPermission()
          .then((r) => r === "granted" && window.addEventListener("deviceorientation", onTilt))
          .catch(() => {});
      } else window.addEventListener("deviceorientation", onTilt);
    };
    if (window.matchMedia("(pointer: coarse)").matches && !sim.calm) {
      const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
      if (!D?.requestPermission) askTilt();
    }
    const points: { x: number; y: number; t: number }[] = [];

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      sim.resize(w, h);
      renderer?.resize(w, h);
      const d = Math.min(window.devicePixelRatio || 1, 2);
      trail.width = w * d;
      trail.height = h * d;
      tctx?.setTransform(d, 0, 0, d, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const initial = fromHash();
    if (initial !== null) {
      sim.open(pieceFor(initial));
      window.setTimeout(() => setOpen(initial), 0);
    }

    /* ── pointer ── */
    let lastMove = 0;
    let flash = 0;
    let mode = "";
    const setMode = (m: string) => {
      if (m !== mode) {
        mode = m;
        ring.dataset.mode = m;
      }
    };

    // where the pointer really is, where the ring is drawn, and what it is over
    const mouse = { x: 0, y: 0, seen: false };
    const drawn = { x: 0, y: 0 };
    let over: Element | null = null;
    let snapped: HTMLElement | null = null;
    let held = -1e9;

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const c = sim.cursor;
      const speed = c.active && now > lastMove ? Math.hypot(e.clientX - c.x, e.clientY - c.y) / ((now - lastMove) / 1000) : 0;
      c.x = e.clientX;
      c.y = e.clientY;
      c.active = true;
      lastMove = now;
      if (!mouse.seen) {
        drawn.x = e.clientX;
        drawn.y = e.clientY;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.seen = true;
      over = e.target as Element | null;
      ring.dataset.on = "true";

      const overUi = !!over?.closest("a, button, .cards");
      if (sim.opened === null) {
        // a swipe leaves a streak only while it is fast enough to cut
        if (speed > 700) points.push({ x: e.clientX, y: e.clientY, t: now });
        if (!overUi && sim.pointer(e.clientX, e.clientY, now / 1000) > 0) flash = now + 180;
      }
    };

    /**
     * Dots pull the ring in. Within reach of one, the ring sits on the dot
     * and only gives a few pixels to the pointer's real position.
     */
    const SNAP_REACH = 46;
    const SNAP_GIVE = 0.08;
    const placeRing = (now: number, dt: number) => {
      if (!mouse.seen) return;
      let tx = mouse.x;
      let ty = mouse.y;
      let best: HTMLElement | null = null;
      let bestD = SNAP_REACH;
      for (const el of stage.querySelectorAll<HTMLElement>(".dot, .inkdot > button, .wcard-close > span, .ask-send > span, .ask-clear > span")) {
        if (el.closest("[inert], [data-hide='true']")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(mouse.x - cx, mouse.y - cy);
        if (d < bestD) {
          bestD = d;
          best = el;
          tx = cx + (mouse.x - cx) * SNAP_GIVE;
          ty = cy + (mouse.y - cy) * SNAP_GIVE;
        }
      }
      if (best) held = now;
      if (best !== snapped) {
        snapped?.removeAttribute("data-caught");
        best?.setAttribute("data-caught", "");
        if (best) sound.tick();
      }
      snapped = best;
      // the ring is the pointer: it only eases while a dot holds it, and for a
      // moment after letting go, so ordinary movement never trails behind
      const easing = best !== null || now - held < 160;
      const k = easing ? 1 - Math.exp(-(best ? 24 : 40) * dt) : 1;
      drawn.x += (tx - drawn.x) * k;
      drawn.y += (ty - drawn.y) * k;
      ring.style.transform = `translate3d(${drawn.x}px, ${drawn.y}px, 0)`;

      if (now < flash) setMode("slash");
      else if (best || over?.closest("a, button")) setMode("link");
      else setMode("");
    };

    // a click while the ring is held by a dot presses that dot
    const onClickCapture = (e: MouseEvent) => {
      if (!snapped || (e.target as Element).closest("a, button")) return;
      const btn = snapped.closest("button");
      if (btn) {
        e.stopPropagation();
        btn.click();
      }
    };
    stage.addEventListener("click", onClickCapture, true);

    const onDown = (e: PointerEvent) => {
      sound.wake();
      if (e.pointerType !== "mouse" && !sim.calm) askTilt();
      if ((e.target as Element).closest("a, button, .cards, form")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      sim.cursor.x = e.clientX;
      sim.cursor.y = e.clientY;
      sim.cursor.active = true;
      if (e.pointerType !== "mouse") sim.pointer(e.clientX, e.clientY, performance.now() / 1000);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") {
        sim.cursor.active = false;
        sim.pointerGone();
      }
    };

    const onLeave = () => {
      sim.cursor.active = false;
      sim.pointerGone();
      ring.dataset.on = "false";
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    document.documentElement.addEventListener("pointerleave", onLeave);

    /* ── frame loop ── */
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.step(dt);
      // every cut sprays dust; the dot field flares where it happened
      for (const ev of sim.events) {
        if (!sim.calm) dust.spray(ev);
        renderer?.flare(ev);
        sound.cut(ev.speed, ev.split);
      }
      sim.events.length = 0;
      for (const share of sim.fuses) sound.fuse(share);
      sim.fuses.length = 0;
      if (sim.formed) {
        sim.formed = false;
        sound.fuse(1);
      }
      dust.step(dt);
      renderer?.draw(sim, dt);
      placeRing(now, dt);


      // the swipe: a tapering streak that fades in a fifth of a second
      if (tctx) {
        tctx.clearRect(0, 0, sim.w, sim.h);
        dust.draw(tctx);
        while (points.length && now - points[0].t > 200) points.shift();
        if (points.length > 1) {
          tctx.save();
          tctx.lineCap = "round";
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            if (b.t - a.t > 60) continue;
            const age = 1 - (now - b.t) / 200;
            tctx.strokeStyle = `rgba(150,50,255,${0.95 * age})`;
            tctx.shadowColor = `rgba(160,60,255,${0.8 * age})`;
            tctx.shadowBlur = 8;
            tctx.lineWidth = 0.5 + 2.5 * age * (i / points.length);
            tctx.beginPath();
            tctx.moveTo(a.x, a.y);
            tctx.lineTo(b.x, b.y);
            tctx.stroke();
          }
          tctx.restore();
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      stage.removeEventListener("click", onClickCapture, true);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("deviceorientation", onTilt);
      renderer?.dispose();
    };
  }, [show]);

  // the words are just words; only the dot after them is the link
  const word = (t: Token, text: string) => (
    <span className="word">
      {text}
      <button
        type="button"
        className="dot"
        aria-label={`Open ${LABELS[t]}`}
        onClick={() => show(t)}
      />
    </span>
  );

  const home = open === null;

  return (
    <div ref={stageRef} className="stage fixed inset-0 touch-none select-none overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <canvas ref={trailRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" />

      <a href="#links" className="skip-link">
        Skip to the section links
      </a>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between p-4 sm:p-6">
        <button
          type="button"
          className="hit pointer-events-auto text-left text-[15px] font-semibold leading-tight tracking-tight"
          onClick={() => (home ? simRef.current?.gather() : show(null))}
          aria-label={home ? `${SITE.name}: put the blob back together` : `${SITE.name}: back to the blob`}
        >
          {SITE.name.toLowerCase()}
        </button>
        <button
          type="button"
          onClick={() => show(open === "contact" ? null : "contact")}
          className="hit serif pointer-events-auto bg-white/15 px-3 py-1.5 text-[17px] leading-none transition-colors hover:bg-white hover:text-black"
        >
          → Contact
        </button>
      </header>

      <main className="fade sentence-wrap pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6" data-hide={!home}>
        <h1 id="links" tabIndex={-1} className="sentence max-w-[30ch] outline-none text-center sm:max-w-none [&_button]:pointer-events-auto">
          Explore my {word(0, "projects")}, {word(1, "experience")} or know more {word(2, "about me")}.
        </h1>
      </main>

      <footer className="fade pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-start gap-3 p-4 text-sm sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:p-6" data-hide={!home}>
        <p className="hint text-white/75 sm:max-w-[26ch]">
          {noGl
            ? "Your browser can't draw the blob, but every link still works."
            : "Swipe fast across the blob to slice it."}
        </p>
        <nav aria-label="Elsewhere" className="hint serif pointer-events-auto flex flex-wrap gap-x-5 gap-y-1 text-[16px] sm:text-[17px] text-white/75 [&>*]:transition-colors hover:[&>*]:text-white">
          <button
            type="button"
            className="hit inline-flex items-center gap-1.5 whitespace-nowrap"
            aria-pressed={soundOn}
            onClick={() => {
              const next = !soundOn;
              soundRef.current?.setOn(next);
              setSoundOn(next);
            }}
          >
            <SpeakerIcon on={soundOn} />
            {soundOn ? "sound on" : "sound off"}
          </button>
          <a className="hit" href={SITE.github} target="_blank" rel="noreferrer">
            github
          </a>
          <a className="hit" href={SITE.linkedin} target="_blank" rel="noreferrer">
            linkedin
          </a>
          <a className="hit" href={SITE.resume} target="_blank" rel="noreferrer">
            resume
          </a>
        </nav>
      </footer>

      {home && <AskBlob onThinking={(t) => simRef.current && (simRef.current.thinking = t)} />}

      {open !== null && <Cards key={open} root={open} onClose={() => show(null)} />}

      <div ref={cursorRef} className="cursor" aria-hidden="true" />
    </div>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor" />
      {on ? (
        <path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.3 6.3 0 0 1 0 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ) : (
        <path d="m10.5 6 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}
