"use client";

import { useEffect, useRef } from "react";

/**
 * Text that arrives jumbled and resolves left to right, once, when it
 * mounts. The real words are always in the accessibility tree; only the
 * visible copy scrambles.
 */

const GLYPHS = "▖▗▘▙▚▛▜▝▞▟░▒#%&@$*+=<>/\\|ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const escape = (c: string) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c);
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Decode({ text, delay = 0, duration }: { text: string; delay?: number; duration?: number }) {
  // longer lines take a little longer, so every letter still gets its moment
  const span = duration ?? Math.min(500, 200 + text.length * 3);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const start = performance.now() + delay;
    const chars = [...text];
    // each letter settles at its own moment, roughly left to right
    const settle = chars.map((_, i) => (i / Math.max(1, chars.length - 1)) * 0.75 + Math.random() * 0.25);
    const tick = (now: number) => {
      const t = (now - start) / span;
      if (t >= 1) {
        el.textContent = text;
        return;
      }
      // settled letters are plain text; letters still scrambling glow purple
      let out = "";
      let glyphs = "";
      const flush = () => {
        if (glyphs) out += `<span class="glyph">${glyphs}</span>`;
        glyphs = "";
      };
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === " " || t >= settle[i]) {
          flush();
          out += escape(ch);
        } else if (t < 0) {
          flush();
          out += "&nbsp;";
        } else glyphs += escape(GLYPHS[(Math.random() * GLYPHS.length) | 0]);
      }
      flush();
      el.innerHTML = out;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = text;
    };
  }, [text, delay, span]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
    </>
  );
}

/**
 * A blocky grid laid over a thumbnail that breaks up and falls away in
 * random order, so the image resolves out of jumbled pixels.
 */
export function PixelReveal({ color, delay = 0, cell = 10, duration = 560 }: { color: string; delay?: number; cell?: number; duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (reduced()) {
      cv.style.display = "none";
      return;
    }
    const box = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(box.width * dpr));
    cv.height = Math.max(1, Math.round(box.height * dpr));
    const g = cv.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    const cols = Math.ceil(box.width / cell);
    const rows = Math.ceil(box.height / cell);
    // every block gets a moment to vanish and a shade to flicker through
    const gone = Array.from({ length: cols * rows }, () => Math.random());
    const shade = Array.from({ length: cols * rows }, () => Math.random());
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = (now - start) / duration;
      g.clearRect(0, 0, box.width, box.height);
      if (t >= 1) {
        cv.style.display = "none";
        return;
      }
      for (let i = 0; i < gone.length; i++) {
        if (t > gone[i]) continue;
        const x = (i % cols) * cell;
        const y = Math.floor(i / cols) * cell;
        // blocks shuffle between light and dark before they drop out
        const flick = (shade[i] + Math.max(0, t) * 3) % 1;
        g.fillStyle = flick < 0.55 ? color : flick < 0.8 ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
        g.fillRect(x, y, cell, cell);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [color, delay, cell, duration]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
