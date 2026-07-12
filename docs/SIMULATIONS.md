# Simulations (CrewAI) — design

**Status:** proposed / design-review. No execution engine is built yet; this doc
fixes the *shape* (config schema, data model, cost model, MCP surface, framework
catalog) so it can be reviewed before implementation.

## 1. What a simulation is

A **simulation** is a bounded, priced, audited run of multiple **CrewAI** agents
inside **one Modal sandbox**, using OpenRouter for the LLM. It has two modes:

- **`parallel`** — N independent agents, each doing its own task (e.g. a research
  panel where each agent researches a different thing), optionally merged. This
  overlaps the existing swarm but runs through the CrewAI runtime for a single
  standardized framework.
- **`collaborative`** — N **persona** agents that *interact* over up to
  `maxRounds`, optionally against an **environment** (your product via MCP, or a
  dataset), coordinated by CrewAI (`sequential` or `hierarchical` process),
  producing a **transcript** plus synthesized findings. This is the ICP-persona
  example and is the genuinely new capability CrewAI unlocks.

One sandbox runs the whole crew (chosen architecture): cheaper, lower latency,
and CrewAI's own delegation/collaboration does the inter-agent messaging instead
of us routing it through the control plane.

## 2. Standardized framework

Users don't start from a blank page. A **framework catalog** ships reusable
**persona packs + scenarios**, discoverable via MCP and fully overridable —
mirroring `swarm-templates.ts`. Proposed v1 frameworks:

| frameworkId | mode | what it does |
| --- | --- | --- |
| `icp-panel` | collaborative | A set of ICP personas react to a product / positioning and debate it; outputs objections, appeal, pricing sensitivity. |
| `research-panel` | parallel | N researchers each own a sub-topic; an aggregator merges into one brief. |
| `usability-study` | collaborative | Personas attempt tasks against a live product exposed as an MCP tool; outputs friction points + completion. |
| `data-simulation` | parallel or collaborative | Agents run a scenario over a provided dataset (e.g. simulate customer decisions on rows of data). |

A framework supplies default personas, scenario, mode, and a suggested budget;
the caller overrides any field.

## 3. Config schema (the MCP request body)

```ts
// POST /api/v1/simulations
SimulationConfig = {
  mode: "parallel" | "collaborative",
  frameworkId?: string,          // start from a catalog framework; fields below override it
  objective?: string,

  agents: Persona[],             // 1..MAX_AGENTS (proposed 32)
  model?: string,                // default OpenRouter model (falls back to AGENT_DEFAULT_MODEL)
  resources?: ResourceBundle,    // inherited secrets/files/MCP — reuses the existing bundle

  // collaborative only:
  scenario?: {
    environment?:
      | { kind: "mcp";     url: string; token?: string }  // product-under-test as a tool (SSRF-guarded)
      | { kind: "dataset"; data: unknown }                // data-driven simulation
      | { kind: "none" },
    process?: "sequential" | "hierarchical",   // default sequential
    managerModel?: string,                     // hierarchical manager LLM
    maxRounds?: number,                        // default 6, cap MAX_ROUNDS (proposed 20)
    successCriteria?: string,
  },

  // parallel only (or per-Persona.task):
  aggregatorTask?: string,       // optional merge step

  // billing + control (identical semantics to swarms):
  budgetUsd?: number,            // OR budgetMinor — a HARD ceiling
  budgetMinor?: number,
  currency?: string,             // normalized to uppercase
  idempotencyKey?: string,       // derived if omitted; NOT NULL in DB
  callbackUrl?: string,          // signed webhook on terminal state (SSRF-guarded)
}

Persona = {
  name: string,                          // "Skeptical CFO"
  role?: string,                         // "CFO at a 200-person B2B SaaS"
  objective?: string,                    // what this persona is trying to do/decide
  attributes?: Record<string, unknown>,  // demographics, pains, JTBD, tone, constraints…
  model?: string,                        // per-persona model override
  task?: string,                         // parallel mode: this persona's task
}
```

Every boundary is Zod-validated (per repo rule). `agents` length, `maxRounds`,
and task/objective sizes are capped to bound cost and blast radius.

## 4. Cost model — base per agent + metered GPU

```
estimatedCostMinor = agents.length * SIMULATION_AGENT_BASE_MINOR
                   + estimatedGpuSeconds * GPU_RATE_MINOR_PER_SECOND

estimatedGpuSeconds ≈ f(mode, agents.length, maxRounds)   // heuristic, refined by the estimate endpoint
```

- **Base fee**: `SIMULATION_AGENT_BASE_MINOR` — new Zod-validated env, integer
  **minor units**, e.g. default `25` ($0.25/agent). Floating point stays banned.
- **Metered GPU**: unchanged `GPU_RATE_MINOR_PER_SECOND` × actual GPU-seconds the
  sandbox reports.
- **Hard ceiling**: `budgetMinor` reserved atomically via `checkAndReserveBudget`
  (FOR UPDATE), committed exactly-once via `commitBudget` — same append-only
  ledger, same integer-minor-units invariants.
- **Charge granularity**: **one charge per simulation** (`base * agents + gpu`),
  not per agent — because it's one sandbox. `simulation_agents` rows are records,
  not separately-billed jobs (a deliberate divergence from the swarm's per-worker
  jobs — simpler and still fully reconcilable). The base-vs-GPU split is recorded
  in the run's breakdown/receipt, not as separate ledger rows.
- **Estimate**: `POST /api/v1/simulations/estimate` returns
  `{ agents, baseMinor, estimatedGpuSeconds, estimatedCostMinor, withinBudget }`
  so callers (and MCP agents) can dry-run before paying.

## 5. Data model

```
simulation_runs                         -- mirrors swarm_runs
  id, organization_id (fk),
  idempotency_key           NOT NULL,   -- unique (org, key)  [learned from the swarm_runs nullable bug]
  mode                      text,       -- parallel | collaborative
  framework_id              text?,
  status                    text,       -- queued|running|succeeded|partial|failed|cancelled
  input                     jsonb,      -- the validated SimulationConfig
  output                    jsonb,      -- { transcript?, byPersona, findings, aggregatorOutput? }
  cost_minor                bigint,
  base_fee_minor            bigint,     -- breakdown: base component
  gpu_seconds               integer,    -- breakdown: metered component
  cost_currency             varchar(3),
  started_at, finished_at, created_at, updated_at

simulation_agents                       -- mirrors swarm_agents (records, not billed jobs)
  id, simulation_run_id (fk),
  persona_name, role,
  status                    text,
  output                    jsonb,
  error                     jsonb,
  created_at, updated_at
```

Migration adds these two tables + the unique index on
`(organization_id, idempotency_key)`. No execution touches them until the build
phase.

## 6. Execution mapping (build phase — described for review, not yet built)

Reuses the swarm plumbing wholesale, including the correctness fixes just landed:

1. `POST /api/v1/simulations` → `enqueueSimulation`:
   - Zod validate → governance gate (`evaluatePolicy` on aggregate cost, same as
     swarm) → fast `checkBudget` → store resource bundle → insert
     `simulation_run` + a **director job** (`capabilityKind: "simulation"`,
     `orchestrated: true`, `maxAttempts: 1`) inside one transaction, reserving
     budget before it's claimable (the reserve-before-claimable pattern). Returns
     `202 { simulationRunId, status: "queued" }`.
2. Worker claims the director job → **`SimulationRunner`** → POSTs to a new Modal
   endpoint **`/simulate`** in `infra/modal/agent_worker.py`, which:
   - builds a **CrewAI** crew from the personas (agents = personas, tasks/roles
     from config), sets the `Process` (`sequential`/`hierarchical`), wires
     OpenRouter as the LLM and the environment (MCP tool / dataset) as CrewAI
     tools, runs it bounded by `maxRounds` + a wall-clock deadline, and returns
     `{ output, transcript, gpuSeconds, byPersona }`.
   - The director is **not** charged (swarm double-charge fix); the single
     simulation charge (`base*agents + gpu`) is committed once.
3. Result: `GET /api/v1/simulations/:id` (snapshot + transcript),
   `GET /:id/stream` (SSE, reusing the hardened stream loop), signed webhook on
   terminal state.

Isolation, SSRF-guarded environment URLs, encrypted inherited secrets, hard
budget ceiling, bounded rounds/agents, append-only audit + ledger — all inherited
from existing hardened machinery. `AGENT_RUNTIME=modal` (enforced in prod) means
the crew always runs isolated.

## 7. MCP tool surface (self-describing, added to `GET /api/v1`)

| skill id | endpoint | purpose |
| --- | --- | --- |
| `simulate` | `POST /api/v1/simulations` | Run a simulation. |
| `estimate-simulation` | `POST /api/v1/simulations/estimate` | Dry-run cost. |
| `get-simulation` | `GET /api/v1/simulations/:id` | Snapshot + transcript + findings. |
| `stream-simulation` | `GET /api/v1/simulations/:id/stream` | Live SSE progress. |
| `simulation-frameworks` | `GET /api/v1/simulations/frameworks` | The standardized framework catalog. |

An MCP agent with only the base URL can discover the catalog, pick a framework,
estimate, run, and read results — no human in the loop.

## 8. Open decisions to confirm before build

1. **Base fee default** — `SIMULATION_AGENT_BASE_MINOR` = `25` ($0.25/agent)? And
   is it charged per agent regardless of mode, or only per *active* persona?
2. **Caps** — `MAX_AGENTS` = 32, `MAX_ROUNDS` = 20? (bounds cost + runtime.)
3. **Rounds semantics** — map `maxRounds` to CrewAI's own process iterations, or
   drive an explicit outer turn-loop we control (more visible, more code)?
4. **capabilityKind** — new `"simulation"` (recommended, clean separation) vs.
   reuse `"swarm"`.
5. **Charge granularity** — confirm one charge per simulation (recommended) vs.
   per-agent jobs like swarms.
6. **CrewAI dependency** — pin `crewai` in the Modal image (`agent_worker.py`);
   confirm OpenRouter via CrewAI's LiteLLM/OpenAI-compatible base URL is
   acceptable.

## 9. Build order (once shape is approved)

1. Env (`SIMULATION_AGENT_BASE_MINOR`, caps) + config Zod schema + framework
   catalog.
2. DB migration (`simulation_runs`, `simulation_agents`).
3. `estimate` endpoint + cost math (no execution) — lets you feel the pricing.
4. Modal `/simulate` (CrewAI) + `SimulationRunner` + `enqueueSimulation`.
5. Read/stream endpoints + MCP catalog entries + webhooks.
6. Tests (unit + integration) and a live E2E, same bar as the rest of the repo.
