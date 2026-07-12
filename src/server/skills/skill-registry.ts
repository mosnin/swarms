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

export const CATALOG_VERSION = "1.6.0";

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

const STREAM_SWARM: SkillDefinition = {
  id: "stream-swarm",
  version: "1.0.0",
  name: "Stream swarm progress (SSE)",
  description:
    "Subscribe to real-time Server-Sent Events for a swarm run. " +
    "Emits swarm.started once, then worker.update for each worker as it completes, " +
    "then swarm.done when the entire run reaches a terminal state. " +
    "For a completed swarm all events arrive immediately; for an in-progress run they stream live. " +
    "Connect with EventSource (browser) or curl --no-buffer. " +
    "Heartbeat comments (': heartbeat') are sent every 5 s to keep the connection alive. " +
    "Stream closes automatically on terminal state or after 10 minutes.",
  endpoint: "/api/v1/swarms/:swarmRunId/stream",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    description: "Each SSE message has an 'event' type and a JSON 'data' payload.",
    properties: {
      "swarm.started": {
        type: "object",
        properties: { swarmRunId: { type: "string" }, status: { type: "string" }, createdAt: { type: "string" } },
      },
      "worker.update": {
        type: "object",
        properties: {
          agentId: { type: "string" },
          role: { type: "string" },
          status: { type: "string" },
          jobId: { type: "string" },
          costMinor: { type: "integer" },
          output: {},
          error: {},
        },
      },
      "swarm.done": {
        type: "object",
        properties: {
          swarmRunId: { type: "string" },
          status: { type: "string" },
          totalWorkers: { type: "integer" },
          costMinor: { type: "integer" },
          finishedAt: { type: "string" },
        },
      },
    },
  },
  examples: [
    {
      title: "Stream a swarm's worker progress with curl",
      curl: `curl -N "$SWARMS_URL/api/v1/swarms/swarm_01abc/stream" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Accept: text/event-stream"`,
      response: [
        { event: "swarm.started", data: { swarmRunId: "swarm_01abc", status: "running" } },
        { event: "worker.update", data: { role: "worker-1", status: "succeeded", costMinor: 80 } },
        { event: "worker.update", data: { role: "worker-2", status: "succeeded", costMinor: 72 } },
        { event: "swarm.done", data: { status: "succeeded", totalWorkers: 2, costMinor: 152 } },
      ],
    },
  ],
  relatedSkills: ["spawn-swarm", "get-swarm-run"],
  tool: {
    type: "function",
    function: {
      name: "stream_swarm",
      description:
        "Open an SSE stream for real-time worker progress on a swarm run. " +
        "Resolves to the swarm.done event payload when the run completes.",
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

const ESTIMATE_SWARM: SkillDefinition = {
  id: "estimate-swarm",
  version: "1.0.0",
  name: "Estimate swarm cost (dry run)",
  description:
    "Preview the budget breakdown for a proposed swarm before committing funds. " +
    "No jobs are created and no money is reserved. " +
    "Returns the per-worker budget, aggregate ceiling, and whether your budget covers the swarm. " +
    "Use this before spawn-swarm to confirm the cost fits your budget, or to explain the price to the user.",
  endpoint: "/api/v1/swarms/estimate",
  method: "POST",
  auth: "bearer",
  input: {
    type: "object",
    required: ["tasks"],
    properties: {
      tasks: { type: "array", minItems: 1, maxItems: 16, items: { type: "string" } },
      aggregatorTask: { type: "string", description: "Include to account for an aggregator slot in the estimate." },
      budgetMinor: { type: "integer", minimum: 0 },
      budgetUsd: { type: "number", description: "Budget in dollars (alternative to budgetMinor)." },
      currency: { type: "string" },
    },
  },
  output: {
    type: "object",
    required: ["agentSlots", "perWorkerMinor", "estimatedCostMinor", "withinBudget"],
    properties: {
      agentSlots: { type: "integer", description: "Total agent slots (workers + aggregator if present)." },
      workerCount: { type: "integer" },
      hasAggregator: { type: "boolean" },
      perWorkerMinor: { type: "integer", description: "Budget allocated to each agent slot." },
      estimatedCostMinor: { type: "integer" },
      estimatedCostUsd: { type: "number", description: "Display-only USD equivalent. Null for non-USD." },
      maxGpuSecondsPerWorker: { type: "integer" },
      rateMinorPerSecond: { type: "integer" },
      currency: { type: "string" },
      withinBudget: { type: "boolean", description: "False when the budget is too low; spawn-swarm would reject it." },
      rejectionReason: { type: "string", description: "Present only when withinBudget is false." },
    },
  },
  examples: [
    {
      title: "Check if $3 covers a 3-task swarm with aggregator",
      curl: `curl -X POST "$SWARMS_URL/api/v1/swarms/estimate" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"tasks":["task A","task B","task C"],"aggregatorTask":"Synthesise","budgetUsd":3.00}'`,
      response: {
        agentSlots: 4,
        workerCount: 3,
        hasAggregator: true,
        perWorkerMinor: 75,
        estimatedCostMinor: 300,
        estimatedCostUsd: 3.0,
        maxGpuSecondsPerWorker: 37,
        rateMinorPerSecond: 2,
        currency: "USD",
        withinBudget: true,
      },
    },
  ],
  relatedSkills: ["spawn-swarm"],
  tool: {
    type: "function",
    function: {
      name: "estimate_swarm",
      description:
        "Dry-run cost preview for a swarm. Check withinBudget before calling spawn_swarm. No money reserved.",
      parameters: {
        type: "object",
        required: ["tasks"],
        properties: {
          tasks: { type: "array", items: { type: "string" }, description: "One item per planned worker." },
          aggregatorTask: { type: "string" },
          budgetUsd: { type: "number" },
          budgetMinor: { type: "integer" },
        },
      },
    },
  },
};

// ── Simulations (CrewAI) ──────────────────────────────────────────────────────

const PERSONA_SCHEMA: JsonSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", description: 'Persona name, e.g. "Skeptical CFO".' },
    role: { type: "string", description: "Who this persona is (title, background)." },
    objective: { type: "string", description: "What this persona is trying to decide or do." },
    attributes: { type: "object", description: "Free-form traits (pains, JTBD, tone, constraints)." },
    model: { type: "string", description: "Per-persona model override." },
    task: { type: "string", description: "parallel mode: this persona's independent task." },
  },
};

const SIMULATION_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["mode", "agents"],
  properties: {
    mode: {
      type: "string",
      enum: ["parallel", "collaborative"],
      description:
        "parallel = N independent agents (optionally merged); collaborative = personas interact over rounds.",
    },
    frameworkId: {
      type: "string",
      description: "Start from a catalog framework (see simulation-frameworks); explicit fields override its defaults.",
    },
    objective: { type: "string", maxLength: 2_000 },
    agents: {
      type: "array",
      minItems: 1,
      maxItems: 32,
      items: PERSONA_SCHEMA,
      description: "1..32 personas. In parallel mode each may carry its own task.",
    },
    model: { type: "string", maxLength: 96, description: "Default model for the crew." },
    resources: RESOURCES_SCHEMA,
    scenario: {
      type: "object",
      description: "collaborative-only settings.",
      properties: {
        environment: {
          type: "object",
          description: "What the crew interacts with: an MCP product-under-test, a dataset, or none.",
        },
        process: { type: "string", enum: ["sequential", "hierarchical"] },
        managerModel: { type: "string", description: "Manager LLM for hierarchical process." },
        maxRounds: { type: "integer", minimum: 1, maximum: 20, description: "Interaction rounds (default 6)." },
        successCriteria: { type: "string" },
      },
    },
    aggregatorTask: { type: "string", description: "Optional final synthesis step over all persona outputs." },
    budgetMinor: { type: "integer", minimum: 0, description: "Hard ceiling in minor units." },
    budgetUsd: { type: "number", description: "Hard ceiling in dollars (alternative to budgetMinor)." },
    currency: { type: "string", description: "ISO-4217 3-letter code, default USD." },
    idempotencyKey: { type: "string", description: "Re-submitting the same key returns the original run." },
    callbackUrl: { type: "string", description: "Signed webhook POSTed on terminal state (SSRF-guarded)." },
  },
};

const SIMULATE: SkillDefinition = {
  id: "simulate",
  version: "1.0.0",
  name: "Run a simulation (CrewAI crew of personas)",
  description:
    "Spin up a crew of persona agents in ONE sandbox and run them in parallel (independent tasks) or " +
    "collaborative (personas interact over rounds against an optional MCP product or dataset) mode. " +
    "Use this to stress-test positioning against ICP personas, run a research panel, or simulate customer " +
    "decisions over data. Start from a frameworkId (see simulation-frameworks) or supply your own personas. " +
    "Cost is one charge: a base fee per agent + metered GPU. The call is async — it returns status 'queued'; " +
    "poll get-simulation or stream-simulation for results. Preview cost first with estimate-simulation.",
  endpoint: "/api/v1/simulations",
  method: "POST",
  auth: "bearer",
  input: SIMULATION_INPUT_SCHEMA,
  output: {
    type: "object",
    required: ["simulationRunId", "status", "mode", "agentCount"],
    properties: {
      simulationRunId: { type: "string" },
      status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
      mode: { type: "string" },
      frameworkId: { type: "string" },
      agentCount: { type: "integer" },
      costMinor: { type: "integer", description: "0 until the run settles; then the committed charge." },
      baseFeeMinor: { type: "integer" },
      estimatedCostMinor: { type: "integer" },
      maxGpuSeconds: { type: "integer" },
      currency: { type: "string" },
    },
  },
  examples: [
    {
      title: "ICP persona panel from a framework",
      curl: `curl -X POST "$SWARMS_URL/api/v1/simulations" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "mode": "collaborative",
    "frameworkId": "icp-panel",
    "objective": "React to our new usage-based pricing for the API platform",
    "agents": [],
    "budgetUsd": 3.00,
    "idempotencyKey": "icp-pricing-2026-q3"
  }'`,
    },
  ],
  relatedSkills: ["estimate-simulation", "get-simulation", "stream-simulation", "simulation-frameworks"],
  tool: {
    type: "function",
    function: {
      name: "simulate",
      description:
        "Run a CrewAI crew of personas in parallel or collaborative mode (one sandbox, one charge). " +
        "Returns a queued run; poll get_simulation for results.",
      parameters: {
        type: "object",
        required: ["mode", "agents"],
        properties: {
          mode: { type: "string", enum: ["parallel", "collaborative"] },
          frameworkId: { type: "string" },
          objective: { type: "string" },
          agents: { type: "array", items: PERSONA_SCHEMA },
          budgetUsd: { type: "number" },
          idempotencyKey: { type: "string" },
        },
      },
    },
  },
};

const ESTIMATE_SIMULATION: SkillDefinition = {
  id: "estimate-simulation",
  version: "1.0.0",
  name: "Estimate simulation cost (dry run)",
  description:
    "Preview the price of a proposed simulation before committing funds. No run is created and no money is " +
    "reserved. Returns the base fee, GPU estimate, total cost, and whether your budget covers it. " +
    "Call this before simulate to confirm the cost.",
  endpoint: "/api/v1/simulations/estimate",
  method: "POST",
  auth: "bearer",
  input: SIMULATION_INPUT_SCHEMA,
  output: {
    type: "object",
    required: ["agents", "baseMinor", "estimatedCostMinor", "withinBudget"],
    properties: {
      mode: { type: "string" },
      agents: { type: "integer" },
      baseMinor: { type: "integer", description: "Base fee: agents × per-agent base." },
      rateMinorPerSecond: { type: "integer" },
      estimatedGpuSeconds: { type: "integer" },
      maxGpuSeconds: { type: "integer" },
      estimatedCostMinor: { type: "integer" },
      estimatedCostUsd: { type: "number", description: "Display-only USD; null for non-USD." },
      reservedMinor: { type: "integer", description: "Amount reserved against the budget (base + max GPU)." },
      currency: { type: "string" },
      withinBudget: { type: "boolean" },
      rejectionReason: { type: "string", description: "Present only when withinBudget is false." },
    },
  },
  examples: [
    {
      title: "Price a 3-persona collaborative panel",
      curl: `curl -X POST "$SWARMS_URL/api/v1/simulations/estimate" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"mode":"collaborative","frameworkId":"icp-panel","agents":[],"budgetUsd":3.00}'`,
    },
  ],
  relatedSkills: ["simulate", "simulation-frameworks"],
  tool: {
    type: "function",
    function: {
      name: "estimate_simulation",
      description: "Dry-run cost preview for a simulation. Check withinBudget before calling simulate.",
      parameters: {
        type: "object",
        required: ["mode", "agents"],
        properties: {
          mode: { type: "string", enum: ["parallel", "collaborative"] },
          frameworkId: { type: "string" },
          agents: { type: "array", items: PERSONA_SCHEMA },
          budgetUsd: { type: "number" },
          budgetMinor: { type: "integer" },
        },
      },
    },
  },
};

const GET_SIMULATION: SkillDefinition = {
  id: "get-simulation",
  version: "1.0.0",
  name: "Get simulation run details",
  description:
    "Retrieve a simulation run: status, per-persona outputs, transcript (collaborative mode), synthesized " +
    "findings, and the committed cost. The simulationRunId is returned by simulate.",
  endpoint: "/api/v1/simulations/:simulationRunId",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    required: ["run"],
    properties: {
      run: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string" },
          mode: { type: "string" },
          output: { description: "{ findings, transcript?, byPersona, aggregatorOutput? }" },
          costMinor: { type: "integer" },
          baseFeeMinor: { type: "integer" },
          gpuSeconds: { type: "integer" },
          agents: { type: "array", items: { type: "object" } },
          finishedAt: { type: "string" },
        },
      },
    },
  },
  examples: [
    {
      title: "Fetch a simulation run",
      curl: `curl "$SWARMS_URL/api/v1/simulations/sim_01abc" \\
  -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
  ],
  relatedSkills: ["simulate", "stream-simulation"],
  tool: {
    type: "function",
    function: {
      name: "get_simulation",
      description: "Fetch the status, per-persona outputs, and findings of a simulation run.",
      parameters: {
        type: "object",
        required: ["simulationRunId"],
        properties: { simulationRunId: { type: "string" } },
      },
    },
  },
};

const STREAM_SIMULATION: SkillDefinition = {
  id: "stream-simulation",
  version: "1.0.0",
  name: "Stream simulation progress (SSE)",
  description:
    "Subscribe to real-time Server-Sent Events for a simulation run. Emits simulation.started, then " +
    "persona.update as each persona's record appears, then simulation.done on terminal state. " +
    "Connect with EventSource or curl --no-buffer; heartbeats keep the connection alive; closes on terminal " +
    "state or after 10 minutes.",
  endpoint: "/api/v1/simulations/:simulationRunId/stream",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    description: "Each SSE message has an 'event' type and JSON 'data'.",
    properties: {
      "simulation.started": { type: "object" },
      "persona.update": { type: "object" },
      "simulation.done": { type: "object" },
    },
  },
  examples: [
    {
      title: "Stream a simulation with curl",
      curl: `curl -N "$SWARMS_URL/api/v1/simulations/sim_01abc/stream" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Accept: text/event-stream"`,
    },
  ],
  relatedSkills: ["simulate", "get-simulation"],
  tool: {
    type: "function",
    function: {
      name: "stream_simulation",
      description: "Open an SSE stream for a simulation run; resolves to simulation.done when it completes.",
      parameters: {
        type: "object",
        required: ["simulationRunId"],
        properties: { simulationRunId: { type: "string" } },
      },
    },
  },
};

const SIMULATION_FRAMEWORKS: SkillDefinition = {
  id: "simulation-frameworks",
  version: "1.0.0",
  name: "List simulation frameworks",
  description:
    "The standardized simulation framework catalog — reusable persona packs + scenarios (icp-panel, " +
    "research-panel, usability-study, data-simulation). Pick a frameworkId and let its defaults fill in " +
    "personas, scenario, and mode; override any field in simulate. No auth required.",
  endpoint: "/api/v1/simulations/frameworks",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    required: ["frameworks"],
    properties: {
      frameworks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            mode: { type: "string" },
            description: { type: "string" },
            personaCount: { type: "integer" },
            hasAggregator: { type: "boolean" },
            suggestedBudgetMinor: { type: "integer" },
          },
        },
      },
    },
  },
  examples: [
    {
      title: "List frameworks",
      curl: `curl "$SWARMS_URL/api/v1/simulations/frameworks" \\
  -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
  ],
  relatedSkills: ["simulate", "estimate-simulation"],
  tool: {
    type: "function",
    function: {
      name: "simulation_frameworks",
      description: "List the standardized simulation frameworks (persona packs + scenarios) you can start from.",
      parameters: { type: "object", properties: {} },
    },
  },
};

// ── Schedules (cron for agents) ───────────────────────────────────────────────

const CREATE_SCHEDULE: SkillDefinition = {
  id: "create-schedule",
  version: "1.0.0",
  name: "Create a recurring schedule",
  description:
    "Run an agent job, swarm, or simulation on a cron schedule (UTC). Provide the same request body you " +
    "would POST to /spawn, /swarms, or /simulations as `request`, plus a 5-field cron expression. Each firing " +
    "enqueues the run through the normal spine (budget, policy, ledger) with a per-firing idempotency key, so " +
    "a run is never duplicated. Use this to turn a one-off into a standing job: nightly research, weekly ICP " +
    "panels, hourly monitors.",
  endpoint: "/api/v1/schedules",
  method: "POST",
  auth: "bearer",
  input: {
    type: "object",
    required: ["name", "kind", "cronExpression", "request"],
    properties: {
      name: { type: "string", maxLength: 255 },
      kind: { type: "string", enum: ["agent", "swarm", "simulation"], description: "What to enqueue each firing." },
      cronExpression: {
        type: "string",
        description: "5-field cron in UTC, e.g. '0 9 * * 1' = 09:00 UTC every Monday.",
      },
      timezone: { type: "string", description: "Display timezone label (scheduling is UTC). Default UTC." },
      request: {
        type: "object",
        description: "The request body to enqueue — identical to the target endpoint's body (minus idempotencyKey).",
      },
    },
  },
  output: {
    type: "object",
    required: ["schedule"],
    properties: {
      schedule: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string" },
          cronExpression: { type: "string" },
          status: { type: "string", enum: ["active", "paused"] },
          nextRunAt: { type: "string" },
          runCount: { type: "integer" },
        },
      },
    },
  },
  examples: [
    {
      title: "Nightly research swarm at 02:00 UTC",
      curl: `curl -X POST "$SWARMS_URL/api/v1/schedules" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Nightly competitor scan",
    "kind": "swarm",
    "cronExpression": "0 2 * * *",
    "request": { "tasks": ["Scan competitor pricing", "Summarise product changes"], "budgetMinor": 200 }
  }'`,
    },
  ],
  relatedSkills: ["list-schedules", "spawn-swarm", "simulate", "spawn-agent"],
  tool: {
    type: "function",
    function: {
      name: "create_schedule",
      description: "Create a cron schedule that recurringly enqueues an agent, swarm, or simulation run.",
      parameters: {
        type: "object",
        required: ["name", "kind", "cronExpression", "request"],
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["agent", "swarm", "simulation"] },
          cronExpression: { type: "string", description: "5-field UTC cron." },
          request: { type: "object" },
        },
      },
    },
  },
};

const LIST_SCHEDULES: SkillDefinition = {
  id: "list-schedules",
  version: "1.0.0",
  name: "List, pause, resume, or delete schedules",
  description:
    "GET /api/v1/schedules lists your schedules with next/last run times and run counts. Pause a schedule " +
    "with POST /api/v1/schedules/:id/pause, resume with /resume (recomputes the next firing from now), and " +
    "remove one with DELETE /api/v1/schedules/:id. GET /api/v1/schedules/:id fetches a single schedule.",
  endpoint: "/api/v1/schedules",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    required: ["schedules"],
    properties: {
      schedules: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            kind: { type: "string" },
            cronExpression: { type: "string" },
            status: { type: "string" },
            nextRunAt: { type: "string" },
            lastRunAt: { type: "string" },
            lastRunRef: { type: "string", description: "jobId / swarmRunId / simulationRunId of the last firing." },
            runCount: { type: "integer" },
          },
        },
      },
    },
  },
  examples: [
    {
      title: "List all schedules",
      curl: `curl "$SWARMS_URL/api/v1/schedules" -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
    {
      title: "Pause a schedule",
      curl: `curl -X POST "$SWARMS_URL/api/v1/schedules/sch_01abc/pause" -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
  ],
  relatedSkills: ["create-schedule"],
  tool: {
    type: "function",
    function: {
      name: "list_schedules",
      description: "List your recurring schedules with their next/last run times and run counts.",
      parameters: { type: "object", properties: {} },
    },
  },
};

// ── Artifacts ─────────────────────────────────────────────────────────────────

const LIST_ARTIFACTS: SkillDefinition = {
  id: "list-artifacts",
  version: "1.0.0",
  name: "List and download run artifacts",
  description:
    "Runs produce artifacts — reports, CSVs, transcripts, images. GET /api/v1/artifacts lists them (filter " +
    "by ?jobId), GET /api/v1/artifacts/:id returns metadata, and GET /api/v1/artifacts/:id/download returns " +
    "the file (a short-lived signed URL in production, or the bytes directly). Upload your own with " +
    "POST /api/v1/artifacts (base64 body). Artifacts are content-hashed and expire per your retention policy.",
  endpoint: "/api/v1/artifacts",
  method: "GET",
  auth: "bearer",
  output: {
    type: "object",
    required: ["artifacts"],
    properties: {
      artifacts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            filename: { type: "string" },
            contentType: { type: "string" },
            sizeBytes: { type: "integer" },
            sha256: { type: "string" },
            jobId: { type: "string" },
            expiresAt: { type: "string" },
            createdAt: { type: "string" },
          },
        },
      },
    },
  },
  examples: [
    {
      title: "List artifacts for a job",
      curl: `curl "$SWARMS_URL/api/v1/artifacts?jobId=job_01abc" -H "Authorization: Bearer $SWARMS_API_KEY"`,
    },
    {
      title: "Download an artifact",
      curl: `curl -L "$SWARMS_URL/api/v1/artifacts/art_01abc/download" -H "Authorization: Bearer $SWARMS_API_KEY" -o report.pdf`,
    },
  ],
  relatedSkills: ["get-job", "get-swarm-run", "get-simulation"],
  tool: {
    type: "function",
    function: {
      name: "list_artifacts",
      description: "List downloadable artifacts a run produced (optionally filtered by jobId).",
      parameters: {
        type: "object",
        properties: { jobId: { type: "string", description: "Filter to a single job's artifacts." } },
      },
    },
  },
};

const UPLOAD_ARTIFACT: SkillDefinition = {
  id: "upload-artifact",
  version: "1.0.0",
  name: "Upload an artifact",
  description:
    "Store a file as an artifact (base64-encoded body), optionally linking it to a job / swarm / simulation " +
    "run. Returns the artifact id and content hash. Subject to the org's max-size and retention policy.",
  endpoint: "/api/v1/artifacts",
  method: "POST",
  auth: "bearer",
  input: {
    type: "object",
    required: ["filename", "contentBase64"],
    properties: {
      filename: { type: "string", maxLength: 512 },
      contentType: { type: "string", maxLength: 128 },
      contentBase64: { type: "string", description: "Base64-encoded file bytes." },
      jobId: { type: "string" },
      swarmRunId: { type: "string" },
      simulationRunId: { type: "string" },
    },
  },
  output: {
    type: "object",
    required: ["artifact"],
    properties: {
      artifact: {
        type: "object",
        properties: { id: { type: "string" }, filename: { type: "string" }, sha256: { type: "string" }, sizeBytes: { type: "integer" } },
      },
    },
  },
  examples: [
    {
      title: "Upload a report",
      curl: `curl -X POST "$SWARMS_URL/api/v1/artifacts" \\
  -H "Authorization: Bearer $SWARMS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"filename":"brief.md","contentType":"text/markdown","contentBase64":"IyBCcmllZgo="}'`,
    },
  ],
  relatedSkills: ["list-artifacts"],
  tool: {
    type: "function",
    function: {
      name: "upload_artifact",
      description: "Store a base64-encoded file as an artifact, optionally linked to a run.",
      parameters: {
        type: "object",
        required: ["filename", "contentBase64"],
        properties: {
          filename: { type: "string" },
          contentType: { type: "string" },
          contentBase64: { type: "string" },
          jobId: { type: "string" },
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
    ESTIMATE_SWARM,
    STREAM_SWARM,
    SIMULATE,
    ESTIMATE_SIMULATION,
    GET_SIMULATION,
    STREAM_SIMULATION,
    SIMULATION_FRAMEWORKS,
    CREATE_SCHEDULE,
    LIST_SCHEDULES,
    LIST_ARTIFACTS,
    UPLOAD_ARTIFACT,
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
