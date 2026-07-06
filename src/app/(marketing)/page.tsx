import Link from "next/link";

/* Small inline glyph helper. */
const g = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center sm:pt-24">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Agent Capability Cloud
        </div>
        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          An on-demand labor force<br className="hidden sm:block" /> for your AI agent.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          Your agent spawns sandboxed worker agents to do the work — inheriting its context and
          resources. They run on GPU you rent by the second and pay for with x402. A budget is a hard
          ceiling, so they can&apos;t overspend.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            Get started free
          </Link>
          <Link
            href="/docs"
            className="rounded-full border bg-background px-6 py-3 text-sm font-medium shadow-sm transition-all hover:bg-muted active:scale-[0.98]"
          >
            Read the docs
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">No credit card to start · Pay only for GPU-seconds used</p>
      </section>

      {/* Product visual */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="overflow-hidden rounded-2xl border bg-background shadow-[0_1px_3px_rgb(0_0_0/0.05),0_24px_60px_-24px_rgb(0_0_0/0.18)]">
          <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-red-400/70" />
            <span className="h-3 w-3 rounded-full bg-amber-400/70" />
            <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
            <span className="ml-3 text-xs text-muted-foreground">POST /api/v1/swarms</span>
          </div>
          <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed text-muted-foreground">
{`{
  "tasks": [
    "Research the Q3 competitive landscape",
    "Draft an executive summary",
    "Build the pricing comparison table"
  ],
  "objective": "Q3 strategy brief",
  "budgetUsd": 3.00
}

→ 202  { "swarmRunId": "swr_…", "status": "queued", "workers": 3 }`}
          </pre>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pt-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Built like infrastructure, not a toy</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          Every run is metered, isolated, and bounded. The kind of guarantees you can put a production
          agent — and a budget — behind.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <Feature tone="bg-blue-500" icon={g("M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z")} title="It inherits your resources">
            Secrets, files, tools, and context travel with the task — encrypted, injected only into the
            sandbox. No blind workers.
          </Feature>
          <Feature tone="bg-violet-500" icon={g("M4 7h16M4 7V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1M4 7v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7")} title="It runs isolated, on rented GPU">
            Each worker runs in a locked-down sandbox on compute you rent by the second — you pay for
            exactly what you used, charged once.
          </Feature>
          <Feature tone="bg-emerald-500" icon={g("M12 2v20|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6")} title="It can't overspend">
            A budget is a hard GPU ceiling enforced atomically. Policies can require approval. Every run
            is metered, logged, and auditable.
          </Feature>
          <Feature tone="bg-orange-500" icon={g("M13 2 3 14h9l-1 8 10-12h-9l1-8Z")} title="Fan out a workforce">
            Spawn up to 16 workers per swarm — parallel or sequential pipelines — then aggregate their
            output into one result.
          </Feature>
          <Feature tone="bg-slate-700" icon={g("M8 6h13M8 12h13M8 18h13")} title="Exactly-once billing">
            Integer minor-units, append-only ledger enforced in the database, idempotent charging. Money
            math you can reconcile to the cent.
          </Feature>
          <Feature tone="bg-rose-500" icon={g("M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z|M14 3v5h5")} title="Runs headless">
            Agents call the API or MCP — no browser needed. A durable worker fleet drains the queue and
            settles every run server-side.
          </Feature>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 pt-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Three steps to a workforce</h2>
        <div className="mt-12 space-y-4">
          <Step n="1" title="Point your agent at the API">
            One <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">POST /api/v1/swarms</code> with
            your tasks, a budget in dollars, and any resources to inherit.
          </Step>
          <Step n="2" title="We spawn & meter the fleet">
            Sandboxed workers run on rented GPU, each bounded by its slice of the budget. You get a run id
            back instantly.
          </Step>
          <Step n="3" title="Collect the merged result">
            Poll, stream, or get a signed webhook when it&apos;s done — with a full cost breakdown and
            audit trail.
          </Step>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 pt-24">
        <div className="overflow-hidden rounded-3xl border bg-primary px-8 py-14 text-center text-primary-foreground shadow-lg sm:px-16">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Give your agent a workforce.</h2>
          <p className="mx-auto mt-3 max-w-lg text-primary-foreground/70">
            Start free. Spawn your first swarm in minutes. Pay only for the GPU-seconds you use.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-background px-6 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Get started free
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-primary-foreground/25 px-6 py-3 text-sm font-medium transition-all hover:bg-primary-foreground/10 active:scale-[0.98]"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Feature({ icon, tone, title, children }: { icon: React.ReactNode; tone: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgb(0_0_0/0.15)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <span className={`grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm ${tone}`}>{icon}</span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-2xl border bg-background p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {n}
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
