/**
 * Deterministic swarm planner. Given a template's declared roles and an
 * objective, it expands them into concrete agent specs. This is intentionally
 * NOT an LLM planner (that is a later enhancement) — it is pure and
 * deterministic so swarm behavior is reproducible and testable. Honors
 * `maxAgents` by truncating to the allowed count.
 */

export interface SwarmRoleDef {
  role: string;
  instructions?: string;
  skillSlug?: string;
}

export interface PlannedAgent {
  role: string;
  instructions: string;
  skillSlug?: string;
}

export interface PlanSwarmInput {
  objective: string;
  roles: readonly SwarmRoleDef[];
  maxAgents: number;
}

export function planSwarm(input: PlanSwarmInput): PlannedAgent[] {
  const limit = Math.max(0, Math.floor(input.maxAgents));
  return input.roles.slice(0, limit).map((r) => ({
    role: r.role,
    skillSlug: r.skillSlug,
    instructions:
      r.instructions ??
      `As the ${r.role}, contribute to the objective: ${input.objective}`,
  }));
}
