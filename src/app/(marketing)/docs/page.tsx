import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Docs — Swarms" };

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-4 text-[13px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3 border-t pt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-8 pt-16 sm:pt-20">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Documentation</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Quickstart</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Swarms is a REST API. Your agent points at it, spawns a workforce, and gets metered,
          auditable results back. Everything runs headless — no browser required.
        </p>
      </div>

      <div className="mt-10 space-y-10">
        <Section title="1 · Get an API key">
          <p className="text-sm text-muted-foreground">
            Create a key in the dashboard under <strong>Settings → API Keys</strong>. Keys are shown
            once, hashed at rest, and can carry their own spending budget.
          </p>
          <Code>{`Authorization: Bearer hk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
        </Section>

        <Section id="api" title="2 · Spawn a single agent">
          <p className="text-sm text-muted-foreground">
            One agent, one task, a dollar budget that acts as a hard ceiling.
          </p>
          <Code>{`curl https://api.swarms.dev/api/v1/spawn \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "Summarize the attached transcript into 5 bullets",
    "budgetUsd": 0.25
  }'

# → 201 { "jobId": "job_…", "status": "queued", "executionUrl": "/api/v1/jobs/job_…" }`}</Code>
        </Section>

        <Section title="3 · Spawn a swarm">
          <p className="text-sm text-muted-foreground">
            Up to 16 workers, run in parallel or as a sequential pipeline, optionally aggregated into a
            single merged result. Returns immediately with a run id.
          </p>
          <Code>{`curl https://api.swarms.dev/api/v1/swarms \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tasks": ["Research", "Draft", "Fact-check"],
    "objective": "Launch brief",
    "aggregatorTask": "Merge into one brief",
    "budgetUsd": 3.00
  }'

# → 202 { "swarmRunId": "swr_…", "status": "queued", "workerCount": 3 }`}</Code>
        </Section>

        <Section title="4 · Get the result">
          <p className="text-sm text-muted-foreground">
            Poll the run, stream progress over SSE, or receive a signed webhook when it reaches a
            terminal state — each with a full cost breakdown.
          </p>
          <Code>{`GET  /api/v1/swarms/swr_…            # snapshot + merged output
GET  /api/v1/swarms/swr_…/stream     # server-sent events, live
POST /api/v1/webhooks                # register a signed callback URL`}</Code>
        </Section>

        <Section id="mcp" title="5 · Call it from an MCP agent">
          <p className="text-sm text-muted-foreground">
            The API is self-describing at <code className="rounded bg-muted px-1 py-0.5">GET /api/v1</code>
            {" "}— an agent that knows only the base URL can discover every endpoint, the skill catalog,
            and the auth scheme, then navigate from there. No UI, no human in the loop.
          </p>
          <Code>{`GET https://api.swarms.dev/api/v1
# → { "api": "swarms", "links": { "spawn": "/api/v1/spawn",
#      "swarms": "/api/v1/swarms", "estimateSwarm": "/api/v1/swarms/estimate" }, … }`}</Code>
        </Section>
      </div>

      <div className="mt-12 rounded-2xl border bg-background p-6 text-center shadow-sm">
        <h3 className="font-semibold">Ready to spawn your first swarm?</h3>
        <p className="mt-1 text-sm text-muted-foreground">Grab a key and go — you only pay for GPU-seconds used.</p>
        <Link
          href="/login"
          className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}
