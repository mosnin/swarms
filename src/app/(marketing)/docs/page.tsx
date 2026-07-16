import Link from "next/link";
import type { Metadata } from "next";

import { Reveal } from "@/app/(marketing)/_components/reveal";
import { CodeBlock } from "@/app/(marketing)/docs/_components/code-block";
import { DocsToc } from "@/app/(marketing)/docs/_components/docs-toc";

export const metadata: Metadata = { title: "Docs — Swarms" };

const TOC = [
  { id: "auth", label: "Get an API key" },
  { id: "agent", label: "Spawn an agent" },
  { id: "api", label: "Spawn a swarm" },
  { id: "results", label: "Get the result" },
  { id: "more", label: "Simulate & schedule" },
  { id: "mcp", label: "Call it from MCP" },
];

function Section({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 space-y-4 border-t border-neutral-100 pt-10">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm text-neutral-300">{n}</span>
        <h2 className="text-xl font-medium tracking-tight text-neutral-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-8 pt-16 sm:pt-20">
      <Reveal className="max-w-2xl">
        <p className="text-sm font-medium tracking-wide text-violet-600">Documentation</p>
        <h1 className="mt-2 text-4xl font-light tracking-tight text-neutral-950">
          <span className="font-semibold">Quickstart.</span>
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-500">
          Swarms is a REST API. Your agent points at it, spawns a workforce, and gets metered, auditable
          results back. Everything runs headless — no browser required.
        </p>
      </Reveal>

      <div className="mt-12 flex gap-16">
        <DocsToc items={TOC} />

        <div className="min-w-0 flex-1 space-y-10">
          <Section id="auth" n="01" title="Get an API key">
            <p className="text-[15px] leading-relaxed text-neutral-500">
              Create a key in the dashboard under <strong className="font-medium text-neutral-800">Settings → API Keys</strong>.
              Keys are shown once, hashed at rest, and can carry their own spending budget.
            </p>
            <CodeBlock label="header">{`Authorization: Bearer hk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</CodeBlock>
          </Section>

          <Section id="agent" n="02" title="Spawn a single agent">
            <p className="text-[15px] leading-relaxed text-neutral-500">
              One agent, one task, a dollar budget that acts as a hard ceiling.
            </p>
            <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/spawn \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "Summarize the attached transcript into 5 bullets",
    "budgetUsd": 0.25
  }'

# → 201 { "jobId": "job_…", "status": "queued", "executionUrl": "/api/v1/jobs/job_…" }`}</CodeBlock>
          </Section>

          <Section id="api" n="03" title="Spawn a swarm">
            <p className="text-[15px] leading-relaxed text-neutral-500">
              Up to 16 workers, run in parallel, as a sequential pipeline, or as a DAG of named steps with
              dependencies — optionally aggregated into a single merged result. Returns immediately with a
              run id.
            </p>
            <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/swarms \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tasks": ["Research", "Draft", "Fact-check"],
    "objective": "Launch brief",
    "aggregatorTask": "Merge into one brief",
    "budgetUsd": 3.00
  }'

# → 202 { "swarmRunId": "swr_…", "status": "queued", "workerCount": 3 }`}</CodeBlock>
          </Section>

          <Section id="results" n="04" title="Get the result">
            <p className="text-[15px] leading-relaxed text-neutral-500">
              Poll the run, stream progress over SSE, or receive a signed webhook when it reaches a
              terminal state — each with a full cost breakdown.
            </p>
            <CodeBlock label="reference">{`GET  /api/v1/swarms/swr_…            # snapshot + merged output
GET  /api/v1/swarms/swr_…/stream     # server-sent events, live
POST /api/v1/webhooks                # register a signed callback URL`}</CodeBlock>
          </Section>

          <Section id="more" n="05" title="Simulate, schedule, and evaluate">
            <p className="text-[15px] leading-relaxed text-neutral-500">
              The same execution spine — budgets, ledger, audit trail — runs three more primitives: a
              CrewAI persona crew, a cron-scheduled recurring run, and an LLM-judge quality gate.
            </p>
            <CodeBlock label="reference">{`POST /api/v1/simulations             # spawn a crew of personas in one sandbox
POST /api/v1/schedules                # run any job/swarm/simulation on a cron
POST /api/v1/evaluations              # score a run's output against a rubric`}</CodeBlock>
          </Section>

          <Section id="mcp" n="06" title="Call it from an MCP agent">
            <p className="text-[15px] leading-relaxed text-neutral-500">
              The API is self-describing at{" "}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[13px] text-neutral-700">
                GET /api/v1
              </code>{" "}
              — an agent that knows only the base URL can discover every endpoint, the skill catalog, and
              the auth scheme, then navigate from there. No UI, no human in the loop.
            </p>
            <CodeBlock label="curl">{`GET https://api.swarms.dev/api/v1
# → { "api": "swarms", "links": { "spawn": "/api/v1/spawn",
#      "swarms": "/api/v1/swarms", "simulations": "/api/v1/simulations", … } }`}</CodeBlock>
          </Section>

          <div className="rounded-[28px] border border-neutral-100 bg-gradient-to-br from-violet-50/70 to-white p-8 text-center">
            <h3 className="text-lg font-medium tracking-tight text-neutral-950">
              Ready to spawn your first swarm?
            </h3>
            <p className="mt-1 text-sm text-neutral-500">Grab a key and go — you only pay for GPU-seconds used.</p>
            <Link
              href="/login"
              className="mt-5 inline-flex rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.98]"
            >
              Get started
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
