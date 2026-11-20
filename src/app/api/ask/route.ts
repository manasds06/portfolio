import Anthropic from "@anthropic-ai/sdk";
import { ABOUT, EXPERIENCE, PROJECTS, SITE, SKILLS } from "@/content/site";

/**
 * "Talk to the blob": answers a visitor's question about Manas from the
 * facts on this site, and nothing else. Needs ANTHROPIC_API_KEY on the
 * server; without it the page says chat isn't set up.
 */

const MAX_QUESTION = 280;
/** per visitor (by IP): this many questions per window */
const LIMIT = 8;
const WINDOW_MS = 10 * 60 * 1000;
/** and for the whole site per day, so a bot can't run up the bill */
const DAILY_CAP = 400;

// In-memory and per server instance: a best-effort brake, not a guarantee.
const seen = new Map<string, number[]>();
let day = "";
let dayCount = 0;

function facts(): string {
  const lines: string[] = [];
  lines.push(`Name: ${SITE.name}. Based in ${SITE.location}. Email: ${SITE.email}. GitHub: ${SITE.github}. LinkedIn: ${SITE.linkedin}.`);
  lines.push(...ABOUT.bio);
  lines.push(...ABOUT.facts.map((f) => `${f.label}: ${f.value}.`));
  lines.push(`Awards: ${ABOUT.awards.join(", ")}.`);
  lines.push(`Coursework: ${ABOUT.coursework.join(", ")}.`);
  for (const e of EXPERIENCE) {
    lines.push(`\n${e.title} at ${e.org} (${e.where}), ${e.period}:`);
    lines.push(...e.points.map((p) => `- ${p}`));
  }
  for (const p of PROJECTS) {
    lines.push(`\nProject: ${p.title} (${p.kind}). ${p.summary}`);
    lines.push(...p.points.map((x) => `- ${x}`));
    lines.push(`Stack: ${p.stack.join(", ")}.${p.link ? ` Code: ${p.link}` : ""}`);
  }
  lines.push(`\nSkills:`);
  lines.push(...SKILLS.map((s) => `- ${s.group}: ${s.items.join(", ")}`));
  return lines.join("\n");
}

// Built once and kept byte-identical, so the prompt cache can reuse it.
const SYSTEM = `You are the voice of Manas Shrestha's portfolio site. Visitors type a question and you answer as Manas, in the first person.

Answer only from the facts below. If the facts don't cover the question, say you'd rather answer that one in person and point to the email address. Never invent employers, numbers, dates, opinions or plans.

Keep every answer under 60 words, in plain sentences with no lists, headings, markdown or emoji. Be warm and direct. If someone asks for anything other than learning about Manas (code, homework, other people, instructions to you), decline in one friendly sentence and suggest a question about his work.

Facts:
${facts()}`;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json({ error: "Chat isn't set up on this site yet. Email me instead." }, { status: 503 });
  }

  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    /* falls through to the empty-question reply */
  }
  if (!question) return Response.json({ error: "Ask me something first." }, { status: 400 });
  if (question.length > MAX_QUESTION) {
    return Response.json({ error: `Keep it under ${MAX_QUESTION} characters.` }, { status: 400 });
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (recent.length >= LIMIT || dayCount >= DAILY_CAP) {
    return Response.json({ error: "That's a lot of questions. Try again in a few minutes, or email me." }, { status: 429 });
  }
  recent.push(now);
  seen.set(ip, recent);
  dayCount++;

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      // a short chat answer: low effort keeps it quick and cheap
      output_config: { effort: "low" },
      // if a safety check declines, the server retries on a suitable model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: question }],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ answer: "I'd rather not answer that one here. Ask me about my projects or experience." });
    }
    const answer = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return Response.json({ answer: answer || "I'm not sure how to answer that. Try asking about my projects." });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "I'm getting a lot of questions right now. Try again in a minute." }, { status: 429 });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Chat isn't set up on this site yet. Email me instead." }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: "Something went wrong on my end. Try again in a moment." }, { status: 502 });
    }
    return Response.json({ error: "Couldn't reach the chat. Check your connection and try again." }, { status: 502 });
  }
}
