/**
 * Marketing site map — the single source of truth for the mega menu, footer,
 * and cross-page "explore more" links. Every feature and use-case page keys
 * off this file so navigation, accents, and copy never drift apart.
 *
 * Accents are Tailwind color families used at low opacities (bg-*-500/10,
 * text-*-600/700) so each page carries one quiet signature color on the same
 * white canvas — variety without breaking the system.
 */

export type Accent = "violet" | "blue" | "emerald" | "amber" | "rose" | "cyan";

export interface SitePage {
  slug: string;
  href: string;
  name: string;
  /** One line under the name in menus — benefit, not mechanism. */
  tagline: string;
  accent: Accent;
}

export const FEATURES: SitePage[] = [
  {
    slug: "spawn",
    href: "/features/spawn",
    name: "On-demand agents",
    tagline: "One API call spawns a worker with your context, tools, and a budget.",
    accent: "violet",
  },
  {
    slug: "swarms",
    href: "/features/swarms",
    name: "Parallel swarms",
    tagline: "Fan a job out to 16 workers and get back one merged answer.",
    accent: "blue",
  },
  {
    slug: "hosted-agents",
    href: "/features/hosted-agents",
    name: "Hosted agents",
    tagline: "Deploy a persistent agent in one click. It remembers. It's always on call.",
    accent: "emerald",
  },
  {
    slug: "budgets",
    href: "/features/budgets",
    name: "Budgets & billing",
    tagline: "Hard spending ceilings, metered to the GPU-second, on an audit-proof ledger.",
    accent: "amber",
  },
  {
    slug: "governance",
    href: "/features/governance",
    name: "Governance",
    tagline: "Policies, human approvals, and an append-only record of every action.",
    accent: "rose",
  },
  {
    slug: "automation",
    href: "/features/automation",
    name: "Automation",
    tagline: "Schedules, webhooks, and evaluations that grade the work for you.",
    accent: "cyan",
  },
];

export const USE_CASES: SitePage[] = [
  {
    slug: "research",
    href: "/use-cases/research",
    name: "Deep research",
    tagline: "Due diligence that used to take a week, done in parallel before lunch.",
    accent: "violet",
  },
  {
    slug: "content",
    href: "/use-cases/content",
    name: "Content pipelines",
    tagline: "Draft, edit, localize, and fact-check as one assembly line.",
    accent: "blue",
  },
  {
    slug: "data",
    href: "/use-cases/data",
    name: "Data extraction",
    tagline: "Turn ten thousand messy documents into one clean table.",
    accent: "emerald",
  },
  {
    slug: "engineering",
    href: "/use-cases/engineering",
    name: "Engineering",
    tagline: "Review, migrate, and test across a codebase — one worker per file.",
    accent: "amber",
  },
  {
    slug: "simulations",
    href: "/use-cases/simulations",
    name: "Market simulation",
    tagline: "Run a 32-persona focus group before you ship, not after.",
    accent: "rose",
  },
  {
    slug: "operations",
    href: "/use-cases/operations",
    name: "Operations",
    tagline: "An always-on staff for monitoring, triage, and the morning report.",
    accent: "cyan",
  },
];

export const COMPANY_LINKS = [
  { href: "/company", name: "Company", tagline: "Why we're building the labor layer for agents." },
  { href: "/security", name: "Security", tagline: "Trust boundaries, isolation, and the audit trail." },
  { href: "/docs", name: "Documentation", tagline: "Spawn your first agent in five minutes." },
  { href: "/pricing", name: "Pricing", tagline: "Metered to the second. Capped by you." },
];

/** Accent → class fragments. Centralized so pages can't drift. */
export const ACCENT = {
  violet: {
    text: "text-violet-600",
    bg: "bg-violet-500/10",
    dot: "bg-violet-500",
    ring: "ring-violet-500/20",
    gradient: "from-violet-600 via-violet-500 to-blue-500",
  },
  blue: {
    text: "text-blue-600",
    bg: "bg-blue-500/10",
    dot: "bg-blue-500",
    ring: "ring-blue-500/20",
    gradient: "from-blue-600 via-blue-500 to-cyan-500",
  },
  emerald: {
    text: "text-emerald-600",
    bg: "bg-emerald-500/10",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/20",
    gradient: "from-emerald-600 via-emerald-500 to-teal-500",
  },
  amber: {
    text: "text-amber-600",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
    ring: "ring-amber-500/20",
    gradient: "from-amber-600 via-orange-500 to-rose-500",
  },
  rose: {
    text: "text-rose-600",
    bg: "bg-rose-500/10",
    dot: "bg-rose-500",
    ring: "ring-rose-500/20",
    gradient: "from-rose-600 via-rose-500 to-orange-500",
  },
  cyan: {
    text: "text-cyan-600",
    bg: "bg-cyan-500/10",
    dot: "bg-cyan-500",
    ring: "ring-cyan-500/20",
    gradient: "from-cyan-600 via-sky-500 to-blue-500",
  },
} as const satisfies Record<Accent, Record<string, string>>;
