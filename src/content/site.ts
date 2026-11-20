/**
 * ─────────────────────────────────────────────────────────────────
 *  Everything the site says about Manas lives here, taken from his
 *  resume. Every section of the page reads from this file.
 * ─────────────────────────────────────────────────────────────────
 */

export const SITE = {
  name: "Manas Shrestha",
  first: "Manas",
  title: "Manas Shrestha · Software Engineer",
  tagline: "Software engineering student building AI systems that hold up in production.",
  description:
    "Manas Shrestha's portfolio: AI agents, an MCP server, a chess trainer and more. Slice the blob to get around.",
  location: "Toronto, ON",
  email: "manasds06@gmail.com",
  github: "https://github.com/manasds06",
  linkedin: "https://linkedin.com/in/manas-shrestha",
  resume: "/resume.pdf",
};

/* ───────────────────────── About ───────────────────────── */

export const ABOUT = {
  bio: [
    "I'm a Software Engineering student at McMaster University and a software engineering intern at Palladium Security, where I build Clarity, a security operations dashboard that five clients use.",
    "Most of what I build puts AI inside software people depend on: multi-agent pipelines that investigate security cases, retrieval that cites its sources, and LLM features that fail safely when the model or the cloud does not cooperate.",
  ],
  facts: [
    { label: "Studying", value: "B.Eng. Software Engineering, McMaster" },
    { label: "Graduating", value: "April 2029" },
    { label: "Based in", value: "Toronto, ON" },
    { label: "Speaks", value: "English, French (Extended French)" },
  ],
  awards: ["Engineering Award of Excellence", "Bilingual Proficiency (Extended French)", "Honor Roll"],
  coursework: ["Data Structures & Algorithms", "Software Design", "Databases", "Concurrent Systems"],
};

export const SKILLS: { group: string; items: string[] }[] = [
  { group: "Languages", items: ["Python", "TypeScript", "JavaScript", "Java", "C/C++", "SQL (PostgreSQL)", "HTML", "CSS"] },
  { group: "AI and LLM", items: ["RAG", "Model Context Protocol", "LangGraph", "Gemini API", "Vertex AI", "OpenAI API", "Ollama"] },
  { group: "Frameworks", items: ["FastAPI", "React", "Next.js", "pandas", "SQLAlchemy", "Pydantic", "Prisma", "Playwright"] },
  { group: "Infrastructure", items: ["Docker", "Redis", "Cloud Run", "Supabase (pgvector)", "SQLite", "GitHub Actions", "Linux"] },
  { group: "Workflow", items: ["Git", "n8n", "Airtable", "Jira", "Confluence", "Postman"] },
];

/* ───────────────────────── Projects ───────────────────────── */

export interface Project {
  id: string;
  title: string;
  kind: string;
  summary: string;
  points: string[];
  stack: string[];
  stats: { label: string; value: string }[];
  link?: string;
  /** Two colours for the project's tile and banner. */
  art: [string, string];
}

export const PROJECTS: Project[] = [
  {
    id: "clarity",
    title: "Clarity",
    kind: "Palladium Security · internship",
    summary: "A full-stack security operations dashboard, deployed to 5 clients.",
    points: [
      "FastAPI and React dashboard for security operations teams.",
      "Python SOAR integrations with Gemini on Vertex AI that auto-investigate cases and flag failed LLM runs.",
      "LangGraph multi-agent system: a manager agent delegates threat analysis to specialist agents.",
      "Redis caching and self-healing fallbacks keep summaries working when Cloud Run fails.",
      "A pipeline loading 2,000+ records into the dashboards cut triage from 15 minutes to under 5.",
    ],
    stack: ["Python", "FastAPI", "React", "LangGraph", "Vertex AI", "Redis", "Cloud Run"],
    stats: [
      { label: "Clients", value: "5" },
      { label: "Triage time", value: "15 → <5 min" },
      { label: "Records", value: "2,000+" },
    ],
    art: ["#33415c", "#7d8597"],
  },
  {
    id: "a2l",
    title: "Avenue2Learn MCP Server",
    kind: "Personal project",
    summary: "Lets AI agents query McMaster's D2L Brightspace through 17 tools.",
    points: [
      "Python MCP server with 17 tool-calling endpoints over Brightspace.",
      "Hybrid search fuses local embeddings with FTS5 BM25 via reciprocal rank fusion, and cites the file and page.",
      "Grade projections refuse to guess when the weights don't reconcile.",
      "Backed by pytest integration tests.",
    ],
    stack: ["Python", "MCP", "Playwright", "SQLite (FTS5)", "pytest"],
    stats: [
      { label: "Tools", value: "17" },
      { label: "Search", value: "Hybrid + RRF" },
      { label: "Citations", value: "File + page" },
    ],
    link: "https://github.com/manasds06/avenue2learn_mcp",
    art: ["#0b7a75", "#36c5b0"],
  },
  {
    id: "blunder",
    title: "Blunder Guard",
    kind: "Personal project",
    summary: "A chess trainer whose bots blunder the way real people do.",
    points: [
      "Next.js trainer with 400 to 2000 Elo Stockfish bots running in a Web Worker.",
      "Weighted multi-line move sampling makes low-rated bots miss tactics like humans.",
      "An LLM blunder coach grounded in Stockfish evals, swappable across Ollama, Claude and Gemini.",
      "Explanations cached in IndexedDB and a 200-entry server LRU, capped at 20 LLM calls per session.",
      "50,000 Lichess puzzles with Elo-matched spaced repetition, covered by unit and Playwright tests.",
    ],
    stack: ["TypeScript", "Next.js", "React", "Stockfish", "Prisma", "Playwright"],
    stats: [
      { label: "Bot range", value: "400–2000 Elo" },
      { label: "Puzzles", value: "50,000" },
      { label: "LLM cap", value: "20 / session" },
    ],
    link: "https://github.com/manasds06/blunder-guard",
    art: ["#2a3fa8", "#5b7cfa"],
  },
  {
    id: "genestate",
    title: "GenEstate AI Platform",
    kind: "Personal project",
    summary: "One property in, a full set of listing copy and staged photos out.",
    points: [
      "FastAPI REST API with RAG grounding Gemini output in PostgreSQL (pgvector) with HNSW search.",
      "Generates MLS listings, Instagram captions and cold-email copy from a single property input.",
      "Bank of Canada, CREA and TRREB scrapers with per-source TTLs, in a Dockerized backend.",
      "AI virtual staging: Gemini Vision detects the room type, then restages photos in 10 styles.",
    ],
    stack: ["Python", "FastAPI", "Gemini", "Supabase", "pgvector", "Docker"],
    stats: [
      { label: "Staging styles", value: "10" },
      { label: "Data sources", value: "3 scrapers" },
      { label: "Search", value: "HNSW" },
    ],
    link: "https://github.com/manasds06/GenEstate",
    art: ["#a23b72", "#e86fb0"],
  },
  {
    id: "outreach",
    title: "Lead Outreach Pipeline",
    kind: "Fiscal Elevate · internship",
    summary: "Cold outreach for a real estate AI startup, from raw leads to personalised emails.",
    points: [
      "n8n pipeline ingesting 1,000 to 2,000 lead batches into Airtable.",
      "A prompt-tuned OpenAI GPT model turns each batch into 100 to 200 personalised emails to realtors.",
      "Airtable and Google Sheets kept in sync through n8n loops, ending manual entry.",
    ],
    stack: ["n8n", "OpenAI API", "Airtable", "Google Sheets"],
    stats: [
      { label: "Leads / batch", value: "1,000–2,000" },
      { label: "Emails / batch", value: "100–200" },
      { label: "Manual entry", value: "None" },
    ],
    art: ["#2b7a3d", "#52c46a"],
  },
];

/* ───────────────────────── Experience ───────────────────────── */

export interface TimelineEntry {
  period: string;
  title: string;
  org: string;
  where: string;
  kind: "work" | "education";
  points: string[];
}

export const EXPERIENCE: TimelineEntry[] = [
  {
    period: "Nov 2025 – Present",
    title: "Software Engineering Intern",
    org: "Palladium Security",
    where: "Brampton, ON · Remote",
    kind: "work",
    points: [
      "Developed Clarity, a full-stack FastAPI/React security operations (SOC) dashboard, deployed to 5 clients.",
      "Built Python SOAR integrations with Gemini on Vertex AI that auto-investigate cases and flag failed LLM runs.",
      "Hardened Clarity's Gemini summary pipeline with Redis caching and self-healing fallbacks when Cloud Run fails.",
      "Engineered a LangGraph multi-agent system where a manager agent delegates threat analysis to specialist agents.",
      "Shipped a Python pipeline loading 2,000+ records into React dashboards, cutting triage from 15 to under 5 min.",
      "Designed Clarity's threat-risk radar chart from Vertex AI confidence scores and added live case-feed search.",
    ],
  },
  {
    period: "Jan 2026 – Apr 2026",
    title: "Software Engineering Intern",
    org: "Fiscal Elevate",
    where: "Remote",
    kind: "work",
    points: [
      "Built an n8n cold-outreach pipeline for a real estate AI startup, ingesting 1,000–2,000 lead batches into Airtable.",
      "Prompt-tuned an OpenAI GPT model to turn each lead batch into 100–200 personalized emails to realtors.",
      "Synced Airtable and Google Sheets by routing multi-field contact data through n8n loops, ending manual entry.",
    ],
  },
  {
    period: "Sep 2024 – Apr 2029",
    title: "B.Eng. Software Engineering",
    org: "McMaster University",
    where: "Hamilton, ON",
    kind: "education",
    points: [
      "Coursework: Data Structures & Algorithms, Software Design, Databases, Concurrent Systems.",
      "Engineering Award of Excellence, Bilingual Proficiency (Extended French), Honor Roll.",
    ],
  },
];
