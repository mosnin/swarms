/**
 * Simulation config schema. Every field an MCP caller may send is Zod-validated
 * here — the single boundary between untrusted input and the simulation engine.
 * Caps (agent count, rounds, task/objective sizes) bound cost and blast radius
 * exactly the way the swarm path caps worker count.
 */

import { z } from "zod";

/** Hard caps — bound cost and runtime. Mirrors the swarm MAX_WORKERS ceiling. */
export const MAX_AGENTS = 32;
export const MAX_ROUNDS = 20;
export const DEFAULT_ROUNDS = 6;

/** A single persona / crew member. In `parallel` mode each carries its own task. */
export const personaSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().max(500).optional(),
  objective: z.string().max(2_000).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  model: z.string().max(96).optional(),
  task: z.string().max(20_000).optional(),
});

export type Persona = z.infer<typeof personaSchema>;

/** Resource bundle inherited by the whole crew (identical shape to swarms). */
const resourcesSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    files: z.record(z.string(), z.string()).optional(),
    mcpServers: z
      .array(z.object({ name: z.string(), url: z.string().url(), token: z.string().optional() }))
      .optional(),
    context: z.string().max(100_000).optional(),
  })
  .optional();

/** collaborative-only environment the crew interacts with. */
const environmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mcp"), url: z.string().url(), token: z.string().optional() }),
  z.object({ kind: z.literal("dataset"), data: z.unknown() }),
  z.object({ kind: z.literal("none") }),
]);

const scenarioSchema = z.object({
  environment: environmentSchema.optional(),
  process: z.enum(["sequential", "hierarchical"]).optional(),
  managerModel: z.string().max(96).optional(),
  maxRounds: z.number().int().positive().max(MAX_ROUNDS).optional(),
  successCriteria: z.string().max(2_000).optional(),
});

export const simulationConfigSchema = z
  .object({
    mode: z.enum(["parallel", "collaborative"]),
    frameworkId: z.string().max(64).optional(),
    objective: z.string().max(2_000).optional(),

    agents: z.array(personaSchema).min(1).max(MAX_AGENTS),
    model: z.string().max(96).optional(),
    resources: resourcesSchema,

    scenario: scenarioSchema.optional(),
    aggregatorTask: z.string().max(20_000).optional(),

    // Billing + control — identical semantics to swarms.
    budgetMinor: z.number().int().nonnegative().optional(),
    budgetUsd: z.number().positive().optional(),
    currency: z
      .string()
      .length(3)
      .transform((c) => c.toUpperCase())
      .optional(),
    idempotencyKey: z.string().min(1).max(255).optional(),
    callbackUrl: z.string().url().optional(),
    organizationId: z.string().optional(),
  })
  .refine((d) => !(d.budgetUsd !== undefined && d.budgetMinor !== undefined), {
    message: "Provide budgetUsd or budgetMinor, not both",
    path: ["budgetUsd"],
  });

export type SimulationConfigInput = z.infer<typeof simulationConfigSchema>;

/**
 * A fully-resolved simulation config: what the engine actually runs, after
 * framework defaults have been applied and the caller's overrides layered on.
 * `agents` is always non-empty and `mode` is always set.
 */
export interface ResolvedSimulationConfig {
  mode: "parallel" | "collaborative";
  frameworkId?: string;
  objective?: string;
  agents: Persona[];
  model: string;
  scenario?: z.infer<typeof scenarioSchema>;
  aggregatorTask?: string;
}
