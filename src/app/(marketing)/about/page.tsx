import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "About — Swarms" };

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-8 pt-16 sm:pt-20">
      <p className="text-sm font-medium text-muted-foreground">About</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
        The execution layer for autonomous agents.
      </h1>
      <p className="mt-6 text-lg text-muted-foreground">
        Agents are getting good at deciding <em>what</em> to do. The missing piece is a safe, metered,
        accountable place to actually <em>do</em> it — at scale, with real money on the line. That&apos;s
        Swarms.
      </p>

      <div className="mt-12 space-y-8">
        <Block title="Why we built it">
          Every serious agent eventually needs to fan work out to other agents, run untrusted code, and
          spend money to get things done. Doing that safely — sandboxed, budgeted, audited, exactly-once
          billed — is hard infrastructure most teams shouldn&apos;t rebuild. We built it once, correctly,
          so your agent can rent a workforce with a single API call.
        </Block>

        <Block title="What we believe">
          Compute should be rented by the second and bounded by a hard ceiling. Money should be integer
          minor-units on an append-only ledger, reconcilable to the cent. Untrusted work should never
          touch your control plane. And the whole thing should run headless — an agent calling an API,
          no human required.
        </Block>

        <Block title="The Agent Capability Cloud">
          Think of it as the cloud primitives — compute, identity, billing, audit — reimagined for a
          world where the customer is an autonomous agent, not a person clicking a dashboard. Pay per
          GPU-second. Spawn a swarm. Get a metered, merged result. That&apos;s the whole promise.
        </Block>
      </div>

      <div className="mt-14 rounded-2xl border bg-background p-8 text-center shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight">Let&apos;s talk</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Building something that needs an agent workforce? We&apos;d love to hear about it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href="mailto:hello@swarms.dev"
            className="rounded-full border bg-background px-5 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-muted active:scale-[0.98]"
          >
            hello@swarms.dev
          </a>
          <Link
            href="/login"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>
      </div>
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </div>
  );
}
