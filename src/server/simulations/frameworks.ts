/**
 * Simulation framework catalog — reusable persona packs + scenarios that a
 * caller can start from and override, mirroring the swarm template catalog. An
 * MCP agent discovers these via GET /api/v1/simulations/frameworks, picks one,
 * and lets its defaults fill in personas/scenario/mode.
 *
 * A framework NEVER wins over an explicit caller field: apply the framework
 * first, then layer the request on top (see applyFramework).
 */

import type { Persona, ResolvedSimulationConfig } from "@/modules/simulations/schema";

export interface SimulationFramework {
  id: string;
  name: string;
  mode: "parallel" | "collaborative";
  description: string;
  /** Default personas — used when the caller supplies none. */
  personas: Persona[];
  /** Default objective, overridable. */
  objective?: string;
  /** collaborative defaults. */
  scenario?: ResolvedSimulationConfig["scenario"];
  aggregatorTask?: string;
  /** Suggested budget in minor units (display / estimate hint only). */
  suggestedBudgetMinor?: number;
}

const ICP_PANEL: SimulationFramework = {
  id: "icp-panel",
  name: "ICP persona panel",
  mode: "collaborative",
  description:
    "A panel of ideal-customer-profile personas reacts to a product or positioning and debates it. " +
    "Outputs objections, appeal, and pricing sensitivity per persona plus a synthesized read.",
  objective: "React to the product/positioning and surface objections, appeal, and pricing sensitivity.",
  personas: [
    {
      name: "Skeptical CFO",
      role: "CFO at a 200-person B2B SaaS company",
      objective: "Decide whether this is worth the budget line; probe ROI and switching cost.",
      attributes: { priorities: ["ROI", "risk", "vendor lock-in"], tone: "hard-nosed" },
    },
    {
      name: "Hands-on Engineering Lead",
      role: "Staff engineer who would own the integration",
      objective: "Judge whether it actually works and how much glue code it needs.",
      attributes: { priorities: ["reliability", "DX", "docs"], tone: "pragmatic" },
    },
    {
      name: "Growth-minded PM",
      role: "Product manager chasing activation metrics",
      objective: "Assess whether it moves a metric they care about this quarter.",
      attributes: { priorities: ["time-to-value", "differentiation"], tone: "enthusiastic" },
    },
  ],
  scenario: { process: "sequential", maxRounds: 6 },
  aggregatorTask:
    "Synthesize the panel into: top 3 objections, strongest appeal, pricing sensitivity, and a go/no-go read.",
  suggestedBudgetMinor: 300,
};

const RESEARCH_PANEL: SimulationFramework = {
  id: "research-panel",
  name: "Research panel",
  mode: "parallel",
  description:
    "N researchers each own a sub-topic and work independently; an aggregator merges their findings into one brief.",
  objective: "Produce a rigorous, well-sourced brief on the objective.",
  personas: [
    { name: "Market analyst", role: "Competitive landscape researcher", task: "Research the competitive landscape and key players." },
    { name: "Technical analyst", role: "Technology and feasibility researcher", task: "Research the underlying technology and feasibility." },
    { name: "Commercial analyst", role: "Pricing and go-to-market researcher", task: "Research pricing models and go-to-market approaches." },
  ],
  aggregatorTask: "Merge all findings into a single concise executive brief with clear sections and sources.",
  suggestedBudgetMinor: 300,
};

const USABILITY_STUDY: SimulationFramework = {
  id: "usability-study",
  name: "Usability study",
  mode: "collaborative",
  description:
    "Personas attempt tasks against a live product exposed as an MCP tool; outputs friction points and completion.",
  objective: "Attempt the given tasks against the product and report friction points and completion.",
  personas: [
    {
      name: "First-time user",
      role: "New user who has never seen the product",
      objective: "Complete onboarding and the primary task without help.",
      attributes: { expertise: "novice" },
    },
    {
      name: "Power user",
      role: "Experienced user pushing advanced flows",
      objective: "Complete an advanced multi-step workflow efficiently.",
      attributes: { expertise: "expert" },
    },
  ],
  scenario: { process: "sequential", maxRounds: 8, environment: { kind: "none" } },
  aggregatorTask: "Summarize friction points, completion rates, and the top 3 usability fixes.",
  suggestedBudgetMinor: 400,
};

const DATA_SIMULATION: SimulationFramework = {
  id: "data-simulation",
  name: "Data-driven simulation",
  mode: "parallel",
  description:
    "Agents run a scenario over a provided dataset (e.g. simulate customer decisions across rows of data).",
  objective: "Run the scenario over the provided dataset and report the aggregate outcome.",
  personas: [
    { name: "Segment A decision-maker", role: "Represents dataset segment A", task: "Simulate decisions for segment A." },
    { name: "Segment B decision-maker", role: "Represents dataset segment B", task: "Simulate decisions for segment B." },
  ],
  aggregatorTask: "Aggregate the per-segment outcomes into overall conversion and revenue estimates.",
  suggestedBudgetMinor: 300,
};

const FRAMEWORKS: SimulationFramework[] = [ICP_PANEL, RESEARCH_PANEL, USABILITY_STUDY, DATA_SIMULATION];

export function listFrameworks(): SimulationFramework[] {
  return FRAMEWORKS;
}

export function findFramework(id: string): SimulationFramework | undefined {
  return FRAMEWORKS.find((f) => f.id === id);
}

/** Public (safe) framework summary for the catalog endpoint. */
export function frameworkSummary(f: SimulationFramework) {
  return {
    id: f.id,
    name: f.name,
    mode: f.mode,
    description: f.description,
    objective: f.objective,
    personaCount: f.personas.length,
    personas: f.personas.map((p) => ({ name: p.name, role: p.role })),
    hasAggregator: Boolean(f.aggregatorTask),
    suggestedBudgetMinor: f.suggestedBudgetMinor,
  };
}
