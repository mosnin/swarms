import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Swarms
      </p>
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
        An on-demand labor force for your AI agent.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Your agent spawns sandboxed worker agents to do the work — handing them the same context and
        resources it has. They run on GPU you rent by the second and pay for with x402. A budget is a
        hard ceiling, so they can&apos;t overspend.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.99]"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border px-5 py-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          Open dashboard
        </Link>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-3">
        <Feature title="It inherits your resources">
          Secrets, files, tools, and context travel with the task — encrypted, injected only into the
          sandbox. No blind workers.
        </Feature>
        <Feature title="It runs isolated, on rented GPU">
          Each worker runs in a locked-down sandbox. You pay per GPU-second via x402 — exactly what you
          used, charged once.
        </Feature>
        <Feature title="It can't overspend">
          A budget is a hard GPU ceiling. Policies can require approval. Every run is metered, logged,
          and auditable.
        </Feature>
      </div>
    </main>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
