/**
 * Swarm templates — pre-built configurations for common multi-agent patterns.
 *
 * A template supplies default values for tasks, aggregatorTask, and sequential
 * mode. Callers pass a templateId to POST /api/v1/swarms; the template expands
 * those defaults before the caller's overrides are applied.
 *
 * Templates are intentionally high-level: placeholders in task strings are
 * replaced at spawn time with values from the request's `objective` field.
 */

export interface SwarmTemplate {
  id: string;
  name: string;
  description: string;
  /** Whether workers run sequentially (pipeline) or in parallel (broadcast). */
  sequential: boolean;
  /**
   * Default task prompts. May contain {{objective}} which is replaced with
   * the caller's objective at spawn time.
   */
  tasks: string[];
  /** Optional aggregator instructions. */
  aggregatorTask?: string;
}

export const SWARM_TEMPLATES: SwarmTemplate[] = [
  {
    id: "research",
    name: "Research",
    description:
      "Parallel research workers each explore a different angle of the objective, " +
      "then an aggregator synthesises the findings into a single report.",
    sequential: false,
    tasks: [
      "Research the following from a historical perspective: {{objective}}",
      "Research the following from a technical perspective: {{objective}}",
      "Research the following from a business / market perspective: {{objective}}",
      "Identify risks, challenges, and open questions related to: {{objective}}",
    ],
    aggregatorTask:
      "You are a research editor. Synthesise the four research reports below into a single, " +
      "well-structured Markdown report. Eliminate redundancy, preserve unique insights, and " +
      "add a concise executive summary at the top.",
  },
  {
    id: "pipeline",
    name: "Pipeline",
    description:
      "Sequential pipeline: scrape → extract → summarise → action. Each step receives " +
      "the previous step's output as context, enabling clean data-transformation chains.",
    sequential: true,
    tasks: [
      "Gather raw information about: {{objective}}. Output everything you find — unfiltered.",
      "Extract the key facts, data points, and entities from the raw content. Output structured bullet points.",
      "Summarise the extracted facts into 3-5 concise paragraphs for a non-technical audience.",
      "Based on the summary, recommend three concrete next actions.",
    ],
  },
  {
    id: "synthesis",
    name: "Mixture-of-Agents Synthesis",
    description:
      "Three independent agents each produce a full answer to the objective, then an " +
      "aggregator picks the best elements from all three and merges them (Mixture-of-Agents).",
    sequential: false,
    tasks: [
      "Answer the following as completely as possible: {{objective}}",
      "Answer the following, focusing on depth and accuracy: {{objective}}",
      "Answer the following, focusing on clarity and practical examples: {{objective}}",
    ],
    aggregatorTask:
      "You are a senior editor. Three agents each answered the same question independently. " +
      "Merge their answers into one definitive response: keep the best reasoning, the clearest " +
      "examples, and the most accurate facts. Remove contradictions. Output one coherent answer.",
  },
];

/** Look up a template by id. Returns undefined when not found. */
export function findTemplate(id: string): SwarmTemplate | undefined {
  return SWARM_TEMPLATES.find((t) => t.id === id);
}

/** Replace {{objective}} placeholders in a template's task strings. */
export function expandTemplate(
  template: SwarmTemplate,
  objective: string,
): { tasks: string[]; aggregatorTask?: string; sequential: boolean } {
  const replace = (s: string) => s.replace(/\{\{objective\}\}/g, objective);
  return {
    tasks: template.tasks.map(replace),
    aggregatorTask: template.aggregatorTask ? replace(template.aggregatorTask) : undefined,
    sequential: template.sequential,
  };
}
