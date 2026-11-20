/**
 * The macOS "genie" minimise, for any element.
 *
 * The element is copied into thin horizontal strips. Each frame, every
 * strip is placed inside a funnel that narrows toward a point below the
 * bottom of the screen, and the strips slide down through it. Drawn
 * together they read as one sheet bending into a tube.
 */

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function genie(el: HTMLElement, opts: { duration?: number; targetX?: number } = {}): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();

  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return Promise.resolve();

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const L = rect.left;
  const T = rect.top;
  const W = rect.width;
  const H = rect.height;
  const R = L + W;
  // the mouth of the funnel: just below the bottom edge, under the card
  const tx = opts.targetX ?? Math.max(40, Math.min(vw - 40, L + W / 2));
  const tw = Math.min(36, W * 0.12);
  const ty = vh + 6;
  const fall = ty - T;
  const duration = opts.duration ?? 620;

  // copies live outside the card's parent, so carry over what they inherited
  const inherited = getComputedStyle(el);
  const scroller = el.querySelector<HTMLElement>(".wcard-scroll");
  const scrollTop = scroller?.scrollTop ?? 0;

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;z-index:45;pointer-events:none;overflow:hidden;contain:strict;";

  // thin strips keep the curved edges smooth rather than stepped
  const n = Math.max(24, Math.min(84, Math.round(H / 7)));
  const band = H / n;
  const strips: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const c = el.cloneNode(true) as HTMLElement;
    c.removeAttribute("id");
    c.removeAttribute("role");
    c.removeAttribute("tabindex");
    const s = c.style;
    s.position = "absolute";
    s.left = `${L}px`;
    s.top = `${T}px`;
    s.width = `${W}px`;
    s.height = `${H}px`;
    s.margin = "0";
    s.maxHeight = "none";
    s.animation = "none";
    s.transition = "none";
    s.filter = "none";
    s.color = inherited.color;
    s.font = inherited.font;
    s.transformOrigin = "0 0";
    s.willChange = "transform";
    // overlap neighbours by half a pixel so no seams show between strips
    const top = Math.max(0, i * band - 0.5);
    const bottom = Math.max(0, H - (i + 1) * band - 0.5);
    s.clipPath = `inset(${top}px 0 ${bottom}px 0)`;
    layer.appendChild(c);
    strips.push(c);
  }
  document.body.appendChild(layer);
  if (scrollTop) {
    for (const c of strips) {
      const sc = c.querySelector<HTMLElement>(".wcard-scroll");
      if (sc) sc.scrollTop = scrollTop;
    }
  }
  el.style.visibility = "hidden";

  // edges of the funnel at screen height y, once it is `form` of the way formed.
  // The top stays wide and the pinch gathers low down, so the sides curve
  // like a bottle's neck rather than running straight.
  const edges = (y: number, form: number): [number, number] => {
    const u = smooth(smooth(clamp01((y - T) / (ty - T) / 0.92)));
    const k = u * form;
    return [L + (tx - tw / 2 - L) * k, R + (tx + tw / 2 - R) * k];
  };

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const t = clamp01((now - start) / duration);
      // the funnel forms first, then the sheet pours down through it
      const form = ease(clamp01(t / 0.45));
      const pour = ease(clamp01((t - 0.18) / 0.82));
      for (let i = 0; i < n; i++) {
        const y0 = T + i * band;
        const y = y0 + pour * fall;
        const [l, r] = edges(y + band / 2, form);
        const sx = Math.max(0.001, (r - l) / W);
        strips[i].style.transform = `translate(${(l - L).toFixed(2)}px, ${(y - y0).toFixed(2)}px) scaleX(${sx.toFixed(4)})`;
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        layer.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

// exposed in development so the animation can be slowed down and inspected
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __genie: typeof genie }).__genie = genie;
}
