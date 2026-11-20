"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Token } from "@/blob/sim";
import { ABOUT, EXPERIENCE, PROJECTS, SITE, SKILLS, type Project } from "@/content/site";
import { genie } from "./genie";
import { Decode, PixelReveal } from "./Decode";

/**
 * Windows that open over the swollen blob. Every kind of card has its own
 * size, place and shape; a dot inside one opens another on top of it.
 */

type CardId = "projects" | "experience" | "about" | "skills" | "contact" | `project:${string}` | `job:${number}`;

interface Shape {
  w: string;
  h: string;
  x: string;
  y: string;
  r: string;
}

const ROOTS: CardId[] = ["projects", "experience", "about"];

const SHAPES: Record<string, Shape> = {
  projects: { w: "min(1080px, 88vw)", h: "80vh", x: "calc(50vw - min(540px, 44vw))", y: "11vh", r: "10px" },
  experience: { w: "min(540px, 44vw)", h: "82vh", x: "6vw", y: "10vh", r: "10px" },
  about: { w: "min(680px, 54vw)", h: "auto", x: "5vw", y: "13vh", r: "10px" },
  skills: { w: "min(780px, 60vw)", h: "auto", x: "30vw", y: "36vh", r: "28px" },
  contact: { w: "min(430px, 72vmin)", h: "min(430px, 72vmin)", x: "calc(92vw - min(430px, 72vmin))", y: "calc(50vh - min(215px, 36vmin))", r: "50%" },
  "job:0": { w: "min(840px, 64vw)", h: "74vh", x: "28vw", y: "14vh", r: "10px" },
  "job:1": { w: "min(620px, 50vw)", h: "auto", x: "38vw", y: "28vh", r: "10px" },
  "job:2": { w: "min(520px, 44vw)", h: "auto", x: "46vw", y: "17vh", r: "36px 10px 36px 10px" },
  "project:clarity": { w: "min(900px, 70vw)", h: "78vh", x: "22vw", y: "12vh", r: "10px" },
  "project:a2l": { w: "min(500px, 42vw)", h: "84vh", x: "12vw", y: "9vh", r: "10px" },
  "project:blunder": { w: "min(680px, 80vmin)", h: "min(680px, 80vmin)", x: "calc(50vw - min(340px, 40vmin))", y: "calc(52vh - min(340px, 40vmin))", r: "26px" },
  "project:genestate": { w: "min(1000px, 80vw)", h: "58vh", x: "10vw", y: "30vh", r: "10px" },
  "project:outreach": { w: "min(540px, 46vw)", h: "auto", x: "48vw", y: "15vh", r: "10px 44px 10px 10px" },
};

export default function Cards({ root, onClose }: { root: Token | "contact"; onClose: () => void }) {
  const [stack, setStack] = useState<CardId[]>([root === "contact" ? "contact" : ROOTS[root]]);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const push = useCallback((id: CardId, e?: React.MouseEvent) => {
    setOrigin(e ? { x: e.clientX, y: e.clientY } : null);
    setStack((s) => (s[s.length - 1] === id ? s : [...s.filter((c) => c !== id), id]));
  }, []);

  const closing = useRef(false);
  /** Close the top card: it genies down into the bottom of the screen first. */
  const pop = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    const el = topRef.current;
    if (el) await genie(el);
    closing.current = false;
    if (stack.length <= 1) onClose();
    else setStack((s) => s.slice(0, -1));
  }, [stack.length, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        pop();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pop]);

  useEffect(() => {
    topRef.current?.focus({ preventScroll: true });
  }, [stack.length]);

  return (
    <div
      className="cards touch-auto select-text"
      onClick={(e) => {
        // a click on the backdrop steps back one card
        if (e.target === e.currentTarget) pop();
      }}
    >
      {stack.map((id, i) => {
        const top = i === stack.length - 1;
        const shape = SHAPES[id] ?? SHAPES.about;
        const round = shape.r === "50%";
        return (
          <div
            key={id}
            ref={top ? topRef : undefined}
            className="wcard"
            data-top={top}
            data-round={round}
            role="dialog"
            aria-label={title(id)}
            tabIndex={-1}
            inert={!top}
            onClick={top ? undefined : () => setStack((s) => s.slice(0, i + 1))}
            style={
              {
                "--w": shape.w,
                "--h": shape.h,
                "--x": shape.x,
                "--y": shape.y,
                "--r": shape.r,
                "--delay": i === 0 ? "360ms" : "0ms",
                "--step": `${Math.min(i, 3) * 14}px`,
                "--ox": top && origin ? `${origin.x}px` : "50vw",
                "--oy": top && origin ? `${origin.y}px` : "50vh",
              } as React.CSSProperties
            }
          >
            <div className="wcard-scroll">
              {!round && (
                <header className="wcard-head">
                  <span>
                    <Decode text={kind(id)} delay={i === 0 ? 380 : 60} />
                  </span>
                  <span>
                    <Decode text={title(id)} delay={i === 0 ? 420 : 100} />
                  </span>
                  <button type="button" className="wcard-close" onClick={pop} aria-label={stack.length > 1 ? "Back" : "Close"}>
                    <span aria-hidden="true" />
                  </button>
                </header>
              )}
              <Body id={id} push={push} pop={pop} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function kind(id: CardId) {
  if (id.startsWith("project:")) return PROJECTS.find((p) => p.id === id.slice(8))?.kind ?? "Project";
  if (id.startsWith("job:")) return EXPERIENCE[Number(id.slice(4))]?.period ?? "";
  return "Page";
}

function title(id: CardId) {
  if (id.startsWith("project:")) return PROJECTS.find((p) => p.id === id.slice(8))?.title ?? "Project";
  if (id.startsWith("job:")) return EXPERIENCE[Number(id.slice(4))]?.org ?? "";
  return { projects: "Projects", experience: "Experience", about: "About", skills: "What I work with", contact: "Say hello" }[id as string] ?? "";
}

type Push = (id: CardId, e?: React.MouseEvent) => void;

/** An inline link in the reference's manner: plain words, then a dot. Only the dot is the link. */
function Dot({ to, push, children }: { to: CardId; push: Push; children: React.ReactNode }) {
  return (
    <span className="inkdot">
      {children}
      <button type="button" aria-label={`Open ${title(to)}`} onClick={(e) => push(to, e)} />
    </span>
  );
}

function Body({ id, push, pop }: { id: CardId; push: Push; pop: () => void }) {
  if (id === "projects") return <ProjectsCard push={push} />;
  if (id === "experience") return <ExperienceCard push={push} />;
  if (id === "about") return <AboutCard push={push} />;
  if (id === "skills") return <SkillsCard />;
  if (id === "contact") return <ContactCard pop={pop} />;
  if (id.startsWith("project:")) {
    const p = PROJECTS.find((x) => x.id === id.slice(8));
    return p ? <ProjectCard p={p} push={push} /> : null;
  }
  if (id.startsWith("job:")) return <JobCard i={Number(id.slice(4))} push={push} />;
  return null;
}

/* ───────────── Projects ───────────── */

/** Where each tile sits on a 12-column sheet: deliberately uneven, like pinned prints. */
const SPOTS = ["1 / span 3", "4 / span 3", "10 / span 3", "5 / span 3", "8 / span 3", "2 / span 3", "7 / span 3"];
const ROWS = [1, 1, 1, 2, 2, 3, 3];

function ProjectsCard({ push }: { push: Push }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  return (
    <div>
      <div className="mb-8 flex justify-end gap-1.5 text-sm font-semibold">
        <button type="button" onClick={() => setView("list")} className={view === "list" ? "" : "opacity-35"} aria-pressed={view === "list"}>
          List
        </button>
        <span aria-hidden="true">/</span>
        <button type="button" onClick={() => setView("grid")} className={view === "grid" ? "" : "opacity-35"} aria-pressed={view === "grid"}>
          Grid
        </button>
      </div>

      {view === "grid" ? (
        <div className="tiles">
          {PROJECTS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="tile text-left"
              style={{ "--col": SPOTS[i % SPOTS.length], "--row": ROWS[i % ROWS.length] } as React.CSSProperties}
              onClick={(e) => push(`project:${p.id}`, e)}
            >
              <span className="tile-art relative" style={{ background: p.art[0], color: p.art[1] }} aria-hidden="true">
                <span>{p.title.split(" ")[0]}</span>
                <PixelReveal color={p.art[0]} delay={420 + i * 70} />
              </span>
              <span className="mt-2 block text-sm font-semibold leading-tight">
                <Decode text={p.title} delay={460 + i * 70} />
              </span>
              <span className="serif block text-[15px]">
                <Decode text={p.kind.split(" · ")[0]} delay={500 + i * 70} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <ul>
          {PROJECTS.map((p) => (
            <li key={p.id} className="border-t border-rule first:border-t-0">
              <button type="button" className="flex w-full items-baseline justify-between gap-6 py-3 text-left" onClick={(e) => push(`project:${p.id}`, e)}>
                <span className="serif text-2xl sm:text-3xl">
                  <Decode text={p.title} />
                </span>
                <span className="shrink-0 text-sm text-dim">
                  <Decode text={p.kind} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({ p, push }: { p: Project; push: Push }) {
  const job = EXPERIENCE.findIndex((e) => p.kind.startsWith(e.org));
  return (
    <div>
      <p className="serif max-w-[46ch] text-[1.35rem] leading-snug sm:text-2xl">
        <Decode text={p.summary} delay={80} duration={340} />
        {job >= 0 && (
          <>
            {" "}
            Built during my time at{" "}
            <Dot to={`job:${job}`} push={push}>
              {EXPERIENCE[job].org}
            </Dot>
            .
          </>
        )}
      </p>
      <div className="tile-art relative mt-6 !aspect-[16/7]" style={{ background: p.art[0], color: p.art[1] }} aria-hidden="true">
        <span>{p.title}</span>
        <PixelReveal color={p.art[0]} delay={120} cell={14} duration={700} />
      </div>
      <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <ul className="space-y-2 leading-relaxed">
          {p.points.map((pt, n) => (
            <li key={pt} className="bullet">
              <Decode text={pt} delay={260 + n * 90} />
            </li>
          ))}
        </ul>
        <div>
          <dl>
            {p.stats.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
                <dt className="text-sm text-dim">
                  <Decode text={s.label} delay={300} />
                </dt>
                <dd className="font-medium tabular-nums">
                  <Decode text={s.value} delay={340} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-dim">
            <Decode text={p.stack.join(", ")} delay={420} />
          </p>
          {p.link && (
            <a href={p.link} target="_blank" rel="noreferrer" className="pill mt-5">
              View on GitHub →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Experience ───────────── */

function ExperienceCard({ push }: { push: Push }) {
  return (
    <div>
      <ul>
        {EXPERIENCE.map((e, i) => (
          <li key={e.org} className="border-t border-rule py-5 first:border-t-0 first:pt-0">
            <p className="text-sm tabular-nums text-dim">
              <Decode text={e.period} delay={400 + i * 90} />
            </p>
            <p className="serif mt-1 text-3xl leading-tight">
              <Dot to={`job:${i}`} push={push}>
                <Decode text={e.org} delay={420 + i * 90} />
              </Dot>
            </p>
            <p className="mt-1.5 text-[15px]">
              <Decode text={e.title} delay={460 + i * 90} /> <span className="text-dim">
                <Decode text={`· ${e.where}`} delay={500 + i * 90} />
              </span>
            </p>
          </li>
        ))}
      </ul>
      <a href={SITE.resume} target="_blank" rel="noreferrer" className="pill mt-6">
        Download resume →
      </a>
    </div>
  );
}

function JobCard({ i, push }: { i: number; push: Push }) {
  const e = EXPERIENCE[i];
  if (!e) return null;
  const built = PROJECTS.filter((p) => p.kind.startsWith(e.org));
  return (
    <div>
      <p className="serif text-[1.35rem] leading-snug sm:text-2xl">
        <Decode text={`${e.title}, ${e.where}.`} delay={80} />
        {built.map((p) => (
          <span key={p.id}>
            {" "}
            See{" "}
            <Dot to={`project:${p.id}`} push={push}>
              {p.title}
            </Dot>
            .
          </span>
        ))}
      </p>
      <ul className="mt-6 max-w-[66ch] space-y-2 leading-relaxed">
        {e.points.map((pt, n) => (
          <li key={pt} className="bullet">
            <Decode text={pt} delay={240 + n * 90} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── About ───────────── */

function AboutCard({ push }: { push: Push }) {
  return (
    <div className="serif space-y-5 text-[1.2rem] leading-snug sm:text-[1.4rem]">
      <p>
        <Decode text="I’m a Software Engineering student at" delay={400} />{" "}
        <Dot to="job:2" push={push}>
          <Decode text="McMaster University" delay={470} />
        </Dot>{" "}
        <Decode text="and a software engineering intern at" delay={520} />{" "}
        <Dot to="job:0" push={push}>
          <Decode text="Palladium Security" delay={580} />
        </Dot>
        <Decode text=", where I build" delay={620} />{" "}
        <Dot to="project:clarity" push={push}>
          <Decode text="Clarity" delay={660} />
        </Dot>
        <Decode text=", a security operations dashboard that five clients use." delay={690} />
      </p>
      <p>
        <Decode text={ABOUT.bio[1]} delay={760} />
      </p>
      <p>
        <Decode text="Here is" delay={860} />{" "}
        <Dot to="skills" push={push}>
          <Decode text="what I work with" delay={890} />
        </Dot>
        <Decode text=", and how to" delay={930} />{" "}
        <Dot to="contact" push={push}>
          <Decode text="say hello" delay={960} />
        </Dot>
        .
      </p>
      <p className="!mt-8 font-sans text-sm leading-relaxed text-dim">
        <Decode text={ABOUT.facts.map((f) => `${f.label}: ${f.value}`).join(" · ")} delay={1000} />
      </p>
    </div>
  );
}

function SkillsCard() {
  return (
    <dl>
      {SKILLS.map((s, n) => (
        <div key={s.group} className="grid gap-x-6 gap-y-1 border-t border-rule py-3 first:border-t-0 first:pt-0 sm:grid-cols-[140px_1fr]">
          <dt className="font-semibold">
            <Decode text={s.group} delay={80 + n * 70} />
          </dt>
          <dd className="serif text-lg leading-snug">
            <Decode text={s.items.join(", ")} delay={120 + n * 70} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ContactCard({ pop }: { pop: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold">
        <Decode text="Say hello" delay={60} />
      </p>
      <EmailCopy />
      <div className="flex flex-wrap justify-center gap-2">
        <a href={`mailto:${SITE.email}`} className="pill">
          Email
        </a>
        <a href={SITE.linkedin} target="_blank" rel="noreferrer" className="pill">
          LinkedIn
        </a>
        <a href={SITE.github} target="_blank" rel="noreferrer" className="pill">
          GitHub
        </a>
        <a href={SITE.resume} target="_blank" rel="noreferrer" className="pill">
          Resume
        </a>
      </div>
      <button type="button" className="wcard-close mt-2" onClick={pop} aria-label="Back">
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The address itself copies to the clipboard: a mailto link does nothing on
 * a computer with no mail app set up, which is most of them.
 */
function EmailCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SITE.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.location.href = `mailto:${SITE.email}`;
    }
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={copy} className="serif break-all text-xl sm:text-2xl" aria-label={`Copy ${SITE.email}`}>
        <Decode text={SITE.email} delay={110} />
      </button>
      <span className="text-xs text-dim" aria-live="polite">
        {copied ? "Copied to clipboard" : "Click to copy"}
      </span>
    </div>
  );
}
