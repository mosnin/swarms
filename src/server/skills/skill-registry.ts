/**
 * Swarms skill registry — machine-readable catalog of everything an agent can
 * do with the platform.  Each entry is self-contained: description, JSON-Schema
 * for inputs and outputs, ready-to-run curl example, and an OpenAI-compatible
 * function-calling tool definition agents can inject directly into their tool
 * list.
 *
 * Versioning rules
 *  patch — doc/example fixes only, no schema change
 *  minor — new optional fields added (backwards-compatible)
 *  major — breaking schema change (field removed or type narrowed)
 *
 * Increment CATALOG_VERSION whenever any skill version bumps.
 */

export const CATALOG_VERSION = "1.1.0";

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

export interface SkillExample {
  title: string;
  description?: string;
  /** Ready-to-run curl command (uses $SWARMS_API_KEY and $SWARMS_URL env vars). */
  curl: string;
  request?: unknown;
  response?: unknown;
}

/** OpenAI function-calling compatible tool definition. */
export interface FunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

export interface SkillDefinition {
  id: string;
  version: string;
  name: string;
  /** Plain-language explanation of when and why to use this skill. */
  description: string;
  endpoint: string;
  method: "GET" | "POST" | "DELETE";
  auth: "bearer";
  input?: JsonSchema;
  output: JsonSchema;
  examples: SkillExample[];
  /** IDs of skills commonly used alongside this one. */
  relatedSkills?: string[];
  /** ISO-8601 date after which this skill is unsupported. */
  deprecatedAt?: string;
  /** Drop-in OpenAI function-calling tool definition. */
  tool: FunctionTool;
}

export interface SkillCatalog {
  catalogVersion: string;
  description: string;
  skills: SkillDefinition[];
}

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const RESOURCES_SCHEMA: JsonSchema = {
  type: "object",
  description:
    "Shared context injected into every worker. Secrets in env are encrypted at rest and never appear in responses.",
  properties: {
    context: {
      type: "string",
      description: "Free-text context string (docs, background, prior output).",
      maxLength: 100_000,
    },
    env: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Secret env vars (API tokens, credentials). Values are redacted in all responses.",
    },
    files: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Virtual files keyed by path, base64-encoded content.",
    },
    mcpServers: {
      type: "array",
      description: "MCP tool servers exposed to every worker.",
      items: {
        type: "object",
        required: ["name", "url"],
        properties: {
          name: { type: "string" },
          url: { type: "string", description: "MCP server URL." },
          token: { type: "string", description: "Bearer token for the MCP server (optional)." },
        },
      },
    },
  },
};

const JOB_OUTPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["job"],
  properties: {
    job: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
        output: { description: "Agent output (present when status=succeeded)." },
        error: {
          type: "object",
          properties: { code: { type: "string" }, message: { type: "string" } },
        },
        costMinor: { type: "integer", description: "Actual spend in minor currency units." },
        costCurrency: { type: "string" },
        createdAt: { type: "string", description: "ISO-8601 timestamp." },
        finishedAt: { type: "string", description: "ISO-8601 timestamp." },
      },
    },
  },
};

// ── Skill definitions ─────────────────────────────────────────────────────────

const SPAWN_SWARM: SkillDefinition = {
  id: "spawn-swarm",
  version: "1.1.0",
  name: "Spawn a swarm (workforce of agents)",
  description:
    "Fan out a list of tasks to N parallel (or sequential) worker agents that all share the same resources and budget. " +
    "Use this when a goal decomposes into independent subtasks that can run concurrently, or when you need a pipeline " +
    "where each step builds on the previous one (set sequential=true). " +
    "Optionally provide aggregatorTask to run a final synthesis agent over all worker outputs (Mixture-of-Agents). " +
    "The call is synchronous — it resolves once all workers (and the optional aggregator) have finished. " +
    "Returns workerCount, per-worker status, and aggregated cost. " +
    "Budget is split evenly; if the budget is too low to give every worker at least 1 GPU-second the call is rejected.",
  endpoint: "/api/v1/swarms",
  method: "POST",
  auth: "bearer",
  input: {
    type: "object",
    required: ["tasks", "idempotencyKey"],
    properties: {
      tasks: {
        type: "array",
        minItems: 1,
        maxItems: 16,
        items: { type: "string", minLength: 1, maxLength: 20_000 },
        description: "One task string per worker agent.",
      },
      objective: {
        type: "string",
        maxLength: 2_000,
        description: "High-level goal prepended to every worker's task.",
      },
      resources: RESOURCES_SCHEMA,
      model: { type: "string", maxLength: 96, description: "LLM model identifier (e.g. deepseek/deepseek-chat-v4)." },
      budgetMinor: {
        type: "integer",
        minimum: 0,
        description: "Maximum total spend in minor currency units (e.g. cents). Divided equally across all agent slots.",
      },
      currency: { type: "string", description: "ISO-4217 3-letter code, default USD." },
      idempotencyKey: {
        type: "string",
        description:
          "Optional. Re-submitting with the same key returns the original result without re-running. " +
          "When omitted, a stable key is derived from your organization ID and the request payload — " +
          "identical requests are automatically deduplicated. Supply an explicit key to run the same " +
          "logical request more than once.",
      },
      aggregatorTask: {
        type: "string",
        maxLength: 20_000,
        description:
          "When set, a final aggregator agent receives all worker outputs and synthesises them into one result " +
          "(Mixture-of-Agents). The aggregator costs one extra budget slot.",
      },
      sequential: {
        type: "boolean",
        description:
          "When true, workers run one-at-a-time and each receives the previous worker's output as context " +
          "(pipeline / chain-of-thought mode). Default false (parallel).",
      },
    },
  },
  output: {
    type: "object",
    required: ["swarmRunId", "status", "workerCount", "workers", "costMinor"],
    properties: {
      swarmRunId: { type: "string" },
      status: { type: "string", enum: ["succeeded", "partial", "failed"] },
      workerCount: { type: "integer" },
      workers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            task: { type: "string" },
            status: { type: "string" },
            output: {},
            error: { type: "object" },
          },
        },
      },
      aggregatorOutput: {
        description: "Present when aggregatorTask was provided and at least one worker succeeded.",
      },
      costMinor: { type: "integer", description: "Total spend across all workers (and aggregator if present)." },
      maxGpuSecondsPerWorker: { type: "integer" },
    },
  },
  examples: [
    {
      title: "Parallel research swarm",
      description: "Three independent research tasks run in parallel, results synthesised by an aggregator.",
      curl: `curl -X POST "$SWARMS_URL/api/v1/swarms" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tasks": [
      "Research the competitive landscape for AI coding assistants",
      "Summarise recent pricing changes across top-10 SaaS tools",
      "List the three fastest-growing open-source LLM projects on GitHub"
    ],
    "objective": "Prepare a market brief for our Q3 planning session",
    "aggregatorTask": "Combine all research into a concise 500-word executive brief",
    "budgetMinor": 300,
    "currency": "USD",
    "idempotencyKey": "market-brief-2026-q3"
  }'`,
      request: {
        tasks: [
          "Research the competitive landscape for AI coding assistants",
          "Summarise recent pricing changes across top-10 SaaS tools",
          "List the three fastest-growing open-source LLM projects on GitHub",
        ],
        objective: "Prepare a market brief for our Q3 planning session",
        aggregatorTask: "Combine all research into a concise 500-word executive brief",
        budgetMinor: 300,
        currency: "USD",
        idempotencyKey: "market-brief-2026-q3",
      },
      response: {
        swarmRunId: "swarm_01abc",
        status: "succeeded",
        workerCount: 3,
        workers: [{ jobId: "job_01", task: "Research...", status: "succeeded", output: {} }],
        aggregatorOutput: { summary: "..." },
        costMinor: 240,
        maxGpuSecondsPerWorker: 50,
      },
    },
    {
      title: "Sequential pipeline (context threading)",
      description: "Workers run in order; each receives the previous worker's output as context.",
      curl: `curl -X POST "$SWARMS_URL/api/v1/swarms" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tasks": ["Scrape the product homepage and extract the value proposition", "Draft a 3-sentence cold email using the extracted value proposition"],
    "sequential": true,
    "budgetMinor": 100,
    "idempotencyKey": "cold-email-pipeline-001"
  }'`,
    },
  ],
  relatedSkills: ["spawn-agent", "get-swarm-run"],
  tool: {
    type: "function",
    function: {
      name: "spawn_swarm",
      description:
        "Fan out tasks to parallel or sequential worker agents that share resources and a budget. " +
        "Optionally synthesise all outputs with an aggregator agent. Returns when all workers finish.",
      parameters: {
        type: "object",
        required: ["tasks", "idempotencyKey"],
        properties: {
          tasks: { type: "array", items: { type: "string" }, description: "One task per worker agent (max 16)." },
          objective: { type: "string", description: "High-level goal prepended to every task." },
          sequential: { type: "boolean", description: "Thread each worker's output into the next (pipeline mode)." },
          aggregatorTask: { type: "string", description: "Synthesis task for a final aggregator agent." },
          budgetMinor: { type: "integer", description: "Max total spend in minor currency units." },
          idempotencyKey: { type: "string" },
        },
      },
    },
  },
};

const SPAWN_AGENT: SkillDefinition = {
  id: "spawn-agent",
  version: "1.0.0",
  name: "Spawn a single agent job",
  description:
    "Create one agent job that runs a single task asynchronously. Use this for a standalone unit of work " +
    "where you don't need fan-out. The job is queued immediately; poll GET /api/v1/jobs/:id until " +
    "status is 'succeeded' or 'failed'. Optionally supply callbackUrl for a signed webhook on completion.",
  endpoint: "/api/v1/spawn",
  method: "POST",
  auth: "bearer",
  input: {
    type: "object",
    required: ["task", "idempotencyKey"],
    properties: {
      task: { type: "string", minLength: 1, maxLength: 20_000, description: "The task for the agent to perform." },
      resources: RESOURCES_SCHEMA,
      model: { type: "string", maxLength: 96 },
      budgetMinor: { type: "integer", minimum: 0 },
      currency: { type: "string" },
      idempotencyKey: { type: "string" },
      callbackUrl: { type: "string", description: "Webhook URL called (POST) when the job reaches a terminal state." },
    },
  },
  output: {
    type: "object",
    required: ["jobId", "status"],
    properties: {
      jobId: { type: "string" },
      status: { type: "string", enum: ["queued", "running"] },
    },
  },
  examples: [
    {
      title: "Spawn a single research agent",
      curl: `curl -X POST "$SWARMS_URL/api/v1/spawn" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "Summarise the key findings from the attached PDF",
    "resources": { "context": "<PDF text here>" },
    "budgetMinor": 50,
    "idempotencyKey": "summarise-pdf-001",
    "callbackUrl": "https://my-app.example.com/webhooks/swarms"
  }'`,
    },
  ],
  relatedSkills: ["get-job", "cancel-job", "spawn-swarm"],
  tool: {
    type: "function",
    function: {
      name: "spawn_agent",
      description: "Queue a single agent job. Poll get_job until it completes.",
      parameters: {
        type: "object",
        required: ["task", "idempotencyKey"],
        properties: {
          task: { type: "string" },
          budgetMinor: { type: "integer" },
          callbackUrl: { type: "string" },
          idempotencyKey: { type: "string" },
        },
      },
    },
  },
};

const GET_JOB: SkillDefinition = {
  id: "get-job",
  version: "1.0.0",
  name: "Get job status and output",
  description:
    "Poll the status of an agent job created via spawn-agent or any worker job inside a swarm. " +
    "Returns status ('queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'), the agent output, " +
    "and the actual cost charged. Poll every few seconds until a terminal state is reached. " +
    "Prefer webhooks (callbackUrl on spawn-agent) over polling for high-volume production use.",
  endpoint: "/api/v1/jobs/:jobId",
  method: "GET",
  auth: "bearer",
  output: JOB_OUTPUT_SCHEMA,
  examples: [
    {
      title: "Poll a job to completion",
      curl: `curl "$SWARMS_URL/api/v1/jobs/job_01abc" \\
  -H "Authorization: Bearer $SWARMS_API_KEY"`,
      response: {
        job: {
          id: "job_01abc",
          status: "succeeded",
          output: { answer: "The model is GPT-5." },
          costMinor: 12,
          costCurrency: "USD",
          createdAt: "2026-06-26T10:00:00Z",
          finishedAt: "2026-06-26T10:00:08Z",
        },
      },
    },
  ],
  relatedSkills: ["spawn-agent", "cancel-job", "get-job-logs"],
  tool: {
    type: "function",
    function: {
      name: "get_job",
      description: "Fetch the current status and output of an agent job.",
      parameters: {
        type: "object",
        required: ["jobId"],
        properties: {
          jobId: { type: "string", description: "The job ID returned by spawn_agent or inside a swarm worker." },
        },
      },
    },
  },
};

const GET_JOB_LOGS: SkillDefinition = {
  id: "get-job-logs",
  version: "1.0.0",
  name: "Get job execution logs",
  description:
    "Retrieve the structured execution log for a job — runner type, step traces, and any error details. " +
    "Useful for debugging a failed or partial job before deciding whether to retry.",
  endpoint: "/api/v1/jobs/:jobId/logs",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    required: ["logs"],
    properties: {
      logs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            level: { type: "string", enum: ["info", "warn", "error"] },
            message: { type: "string" },
            data: {},
            ts: { type: "string" },
          },
        },
      },
    },
  },
  examples: [
    {
      title: "Fetch logs for a failed job",
      curl: `curl "$SWARMS_URL/api/v1/jobs/job_01abc/logs" \\
  -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
  ],
  relatedSkills: ["get-job", "get-swarm-run-logs"],
  tool: {
    type: "function",
    function: {
      name: "get_job_logs",
      description: "Retrieve execution logs for a job to diagnose failures.",
      parameters: {
        type: "object",
        required: ["jobId"],
        properties: {
          jobId: { type: "string" },
        },
      },
    },
  },
};

const CANCEL_JOB: SkillDefinition = {
  id: "cancel-job",
  version: "1.0.0",
  name: "Cancel a job",
  description:
    "Request cancellation of a queued or running job. The job transitions to 'cancelled' and its " +
    "budget reservation is released. Any already-incurred cost up to the cancellation point is still charged.",
  endpoint: "/api/v1/jobs/:jobId/cancel",
  method: "POST",
  auth: "bearer",
  output: {
    type: "object",
    required: ["job"],
    properties: {
      job: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["cancelled"] },
        },
      },
    },
  },
  examples: [
    {
      title: "Cancel a running job",
      curl: `curl -X POST "$SWARMS_URL/api/v1/jobs/job_01abc/cancel" \\
  -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
  ],
  relatedSkills: ["get-job", "spawn-agent"],
  tool: {
    type: "function",
    function: {
      name: "cancel_job",
      description: "Cancel a queued or running job and release its budget reservation.",
      parameters: {
        type: "object",
        required: ["jobId"],
        properties: {
          jobId: { type: "string" },
        },
      },
    },
  },
};

const GET_SWARM_RUN: SkillDefinition = {
  id: "get-swarm-run",
  version: "1.0.0",
  name: "Get swarm run details",
  description:
    "Retrieve the persisted record for a completed (or in-progress) swarm run, including per-worker status " +
    "and the aggregated cost. The swarmRunId is returned by spawn-swarm.",
  endpoint: "/api/v1/swarms/:swarmRunId",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    required: ["swarmRun"],
    properties: {
      swarmRun: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string" },
          output: { type: "object" },
          costMinor: { type: "integer" },
          createdAt: { type: "string" },
          finishedAt: { type: "string" },
        },
      },
    },
  },
  examples: [
    {
      title: "Fetch a swarm run record",
      curl: `curl "$SWARMS_URL/api/v1/swarms/swarm_01abc" \\
  -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
  ],
  relatedSkills: ["spawn-swarm", "get-swarm-run-logs"],
  tool: {
    type: "function",
    function: {
      name: "get_swarm_run",
      description: "Fetch the persisted record for a swarm run.",
      parameters: {
        type: "object",
        required: ["swarmRunId"],
        properties: {
          swarmRunId: { type: "string" },
        },
      },
    },
  },
};

const GET_SWARM_RUN_LOGS: SkillDefinition = {
  id: "get-swarm-run-logs",
  version: "1.0.0",
  name: "Get swarm run logs",
  description: "Retrieve aggregated execution logs for every worker in a swarm run.",
  endpoint: "/api/v1/swarms/:swarmRunId/logs",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    required: ["logs"],
    properties: {
      logs: {
        type: "array",
        items: { type: "object", properties: { level: { type: "string" }, message: { type: "string" } } },
      },
    },
  },
  examples: [
    {
      title: "Fetch swarm run logs",
      curl: `curl "$SWARMS_URL/api/v1/swarms/swarm_01abc/logs" \\
  -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
  ],
  relatedSkills: ["get-swarm-run", "get-job-logs"],
  tool: {
    type: "function",
    function: {
      name: "get_swarm_run_logs",
      description: "Retrieve aggregated logs for all workers in a swarm run.",
      parameters: {
        type: "object",
        required: ["swarmRunId"],
        properties: {
          swarmRunId: { type: "string" },
        },
      },
    },
  },
};

// ── Catalog ───────────────────────────────────────────────────────────────────

export const SKILL_CATALOG: SkillCatalog = {
  catalogVersion: CATALOG_VERSION,
  description:
    "Swarms Agent Skill Catalog. Fetch this once, cache by catalogVersion, re-fetch when " +
    "GET /api/v1/skills/manifest returns a newer catalogVersion. " +
    "Each skill includes an OpenAI-compatible `tool` definition you can pass directly to " +
    "your model's tool list.",
  skills: [
    SPAWN_SWARM,
    SPAWN_AGENT,
    GET_JOB,
    GET_JOB_LOGS,
    CANCEL_JOB,
    GET_SWARM_RUN,
    GET_SWARM_RUN_LOGS,
  ],
};

/** Compact manifest — agents check this to know whether to re-download the full catalog. */
export interface SkillManifest {
  catalogVersion: string;
  skills: Array<{ id: string; version: string; name: string; endpoint: string; method: string }>;
}

export function buildManifest(): SkillManifest {
  return {
    catalogVersion: CATALOG_VERSION,
    skills: SKILL_CATALOG.skills.map((s) => ({
      id: s.id,
      version: s.version,
      name: s.name,
      endpoint: s.endpoint,
      method: s.method,
    })),
  };
}
