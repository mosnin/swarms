import type { Metadata } from "next";

import { CodeBlock } from "@/app/(marketing)/docs/_components/code-block";
import { DocsShell, nextAfter } from "@/app/(marketing)/docs/_components/docs-shell";
import { C, P, Section } from "@/app/(marketing)/docs/_components/section";

export const metadata: Metadata = { title: "Docs — Swarms" };

const TOC = [
  { id: "auth", label: "Get an API key" },
  { id: "agent", label: "Spawn an agent" },
  { id: "swarm", label: "Spawn a swarm" },
  { id: "results", label: "Get the result" },
  { id: "more", label: "Simulate & schedule" },
  { id: "mcp", label: "Call it from MCP" },
];

export default function DocsPage() {
  return (
    <DocsShell
      eyebrow="Documentation"
      title={<span className="font-semibold">Quickstart.</span>}
      lede="Swarms is a REST API. Your agent points at it, spawns a workforce, and gets metered, auditable results back. Everything runs headless — no browser required."
      toc={TOC}
      next={nextAfter("/docs")}
    >
      <Section id="auth" n="01" title="Get an API key">
        <P>
          Create a key in the dashboard under{" "}
          <strong className="font-medium text-neutral-800">Settings → API Keys</strong>. Keys are shown
          once, hashed at rest, and can carry their own spending budget.
        </P>
        <CodeBlock label="header">{`Authorization: Bearer hk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</CodeBlock>
      </Section>

      <Section id="agent" n="02" title="Spawn a single agent">
        <P>One agent, one task, a dollar budget that acts as a hard ceiling.</P>
        <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/spawn \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "task": "Summarize the attached transcript into 5 bullets",
    "budgetMinor": 25,
    "currency": "USD"
  }'

# → 201 { "jobId": "job_…", "status": "queued", "executionUrl": "/api/v1/jobs/job_…" }`}</CodeBlock>
      </Section>

      <Section id="swarm" n="03" title="Spawn a swarm">
        <P>
          Up to 16 workers, run in parallel, as a sequential pipeline, or as a DAG of named steps with
          dependencies — optionally aggregated into a single merged result. Returns immediately with a run
          id. See <C>/docs/swarms</C>.
        </P>
        <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/swarms \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tasks": ["Research", "Draft", "Fact-check"],
    "objective": "Launch brief",
    "budgetMinor": 300
  }'

# → 202 { "swarmRunId": "swr_…", "status": "queued", "workerCount": 3 }`}</CodeBlock>
      </Section>

      <Section id="results" n="04" title="Get the result">
        <P>
          Poll the run, or register a signed webhook to be pushed the terminal state with a full cost
          breakdown — see <C>/docs/webhooks</C>.
        </P>
        <CodeBlock label="reference">{`GET  /api/v1/jobs/job_…              # snapshot + output + cost
GET  /api/v1/swarms/swr_…            # merged output across workers
POST /api/v1/webhooks                # register a signed callback URL`}</CodeBlock>
      </Section>

      <Section id="more" n="05" title="Simulate, schedule, and evaluate">
        <P>
          The same execution spine — budgets, ledger, audit trail — runs three more primitives: a persona
          crew, a cron-scheduled recurring run, and an LLM-judge quality gate.
        </P>
        <CodeBlock label="reference">{`POST /api/v1/simulations             # spawn a crew of personas in one sandbox
POST /api/v1/schedules                # run any job/swarm/simulation on a cron
POST /api/v1/evaluations              # score a run's output against a rubric`}</CodeBlock>
      </Section>

      <Section id="mcp" n="06" title="Call it from an MCP agent">
        <P>
          The API is self-describing at <C>GET /api/v1</C> — an agent that knows only the base URL can
          discover every endpoint, the skill catalog, and the auth scheme, then navigate from there. No UI,
          no human in the loop.
        </P>
        <CodeBlock label="curl">{`GET https://api.swarms.dev/api/v1
# → { "api": "swarms", "links": { "spawn": "/api/v1/spawn",
#      "swarms": "/api/v1/swarms", "agents": "/api/v1/agents", … } }`}</CodeBlock>
      </Section>
    </DocsShell>
  );
}
