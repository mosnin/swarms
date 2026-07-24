/**
 * Curated hosted-agent templates — opinionated starting points a user can
 * deploy in one click. Each is just a preset for createAgentInstance: a name,
 * standing instructions, a wake cadence, and a per-wake budget. Pure data, so
 * the catalog is trivially testable and the same list drives the gallery UI and
 * any programmatic deploy.
 */

export type TemplateAccent = "violet" | "blue" | "emerald" | "amber" | "rose" | "cyan";

export interface AgentTemplate {
  slug: string;
  name: string;
  tagline: string;
  instructions: string;
  /** Heartbeat cadence in minutes; null = wakes only on inbound messages. */
  wakeIntervalMinutes: number | null;
  budgetMinorPerWake: number;
  accent: TemplateAccent;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    slug: "inbox-concierge",
    name: "Inbox Concierge",
    tagline: "Triages inbound messages and drafts crisp replies.",
    instructions:
      "You are an inbox concierge. For each message, judge urgency, summarize what is being asked in one line, and draft a warm, concise reply the user can send as-is or tweak. Flag anything that needs a human decision. Never invent facts you were not given.",
    wakeIntervalMinutes: 60,
    budgetMinorPerWake: 200,
    accent: "violet",
  },
  {
    slug: "standup-digest",
    name: "Standup Digest",
    tagline: "A once-a-day summary of what changed and what needs attention.",
    instructions:
      "Once a day, produce a short standup digest: what moved since yesterday, what is blocked, and the two or three things most worth attention today. Lead with the decisions needed. Keep it to a scannable list, not prose.",
    wakeIntervalMinutes: 1_440,
    budgetMinorPerWake: 300,
    accent: "blue",
  },
  {
    slug: "competitor-watch",
    name: "Competitor Watch",
    tagline: "Keeps an eye on the market and surfaces what's new.",
    instructions:
      "Twice a day, scan for meaningful changes from the competitors and topics you are tracking. Report only what is new and material — a launch, a price change, a notable post — with a one-line 'why it matters'. Skip noise; silence is a valid report.",
    wakeIntervalMinutes: 720,
    budgetMinorPerWake: 400,
    accent: "amber",
  },
  {
    slug: "docs-answerer",
    name: "Docs Answerer",
    tagline: "Answers questions from your documentation, on demand.",
    instructions:
      "Answer questions using only the documentation and context provided. Quote the relevant passage, then give a direct answer. If the docs do not cover it, say so plainly and suggest where the answer might live — never guess.",
    wakeIntervalMinutes: null,
    budgetMinorPerWake: 150,
    accent: "cyan",
  },
  {
    slug: "incident-triage",
    name: "Incident Triage",
    tagline: "First responder for alerts — assess, summarize, escalate.",
    instructions:
      "When an incident or alert arrives, establish severity, summarize the likely blast radius in plain language, list the first two or three checks to run, and state clearly whether a human should be paged now. Be calm, specific, and fast.",
    wakeIntervalMinutes: null,
    budgetMinorPerWake: 500,
    accent: "rose",
  },
  {
    slug: "research-runner",
    name: "Research Runner",
    tagline: "Turns a question into a sourced, synthesized answer.",
    instructions:
      "Given a research question, gather the relevant angles, weigh them, and return a short synthesis with the reasoning and sources behind each claim. Separate what is well-supported from what is speculative. Prefer a sharp, well-cited answer over a long one.",
    wakeIntervalMinutes: null,
    budgetMinorPerWake: 500,
    accent: "emerald",
  },
];

export function templateBySlug(slug: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((t) => t.slug === slug);
}
