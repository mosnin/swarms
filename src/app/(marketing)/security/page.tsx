import type { Metadata } from "next";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { RelatedStrip } from "@/app/(marketing)/_components/related-strip";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import { CodePane, Em, SplitRow, StoryHero, TitleEm } from "@/app/(marketing)/_components/story";
import { ApprovalVisual, LedgerVisual } from "@/app/(marketing)/_components/visuals";

export const metadata: Metadata = {
  title: "Security — Swarms",
  description: "Trust boundaries, sandbox isolation, and the append-only audit trail — written down and enforced in code.",
};

const CONTROLS = [
  ["Sandboxed execution", "Untrusted work runs in isolated sandboxes with no ambient credentials; results are validated before anything trusts them."],
  ["Tenant isolation", "Every query is organization-scoped by construction. Cross-tenant access isn't forbidden — it's impossible to express."],
  ["Hashed credentials", "API keys are stored as salted hashes with short lookup prefixes. Plaintext exists exactly once: the moment we hand it to you."],
  ["Encrypted resources", "Secrets and files that travel with a task are AES-256-GCM envelope-encrypted at rest and injected only inside the sandbox."],
  ["Fail-fast configuration", "Required secrets missing at boot means no boot. Zod validates every environment before the first request is served."],
  ["Rate limits everywhere", "Per-principal limits on every expensive surface, backed by shared storage so they hold across instances."],
  ["Signed webhooks", "Every outbound callback is HMAC-signed so your systems can verify it was us, replay-safely."],
  ["Session integrity", "Dashboard sessions are HMAC-signed tokens verified in constant time — a forged cookie is just noise."],
];

export default function SecurityPage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="rose"
          eyebrow="Security & trust"
          title={
            <>
              Paranoia,
              <br />
              <TitleEm accent="rose">productized.</TitleEm>
            </>
          }
          lede="Swarms executes other people's code with other people's money. We designed for that sentence from day one — trust boundaries written down, then enforced in the type system, the schema, and the sandbox."
          primary={{ href: "/docs", label: "Read the docs" }}
          secondary={{ href: "/company", label: "Our principles" }}
        />
      </div>

      <section className="mx-auto max-w-6xl space-y-24 px-6 py-16 sm:space-y-32">
        <SplitRow
          accent="rose"
          eyebrow="The trust model"
          title="Everything a caller sends is a stranger."
          visual={
            <CodePane label="the boundary, in one table">
              {`untrusted        │ caller inputs & intents
                 │ worker outputs (until validated)
                 │ connector responses
─────────────────┼───────────────────────────────
semi-trusted     │ sandboxed workers
─────────────────┼───────────────────────────────
trusted          │ control plane · Postgres
                 │ authz guard · ledger`}
            </CodePane>
          }
        >
          <p>
            The control plane authorizes, validates, persists, and enqueues — <Em>it never executes
            caller code</Em>. Work happens in sandboxes that arrive with nothing and leave nothing
            behind; their outputs are schema-validated before any system downstream believes them.
          </p>
          <p>
            One authorization choke point guards every mutation. There is no second door to forget
            to lock.
          </p>
        </SplitRow>

        <SplitRow
          accent="rose"
          eyebrow="Human control"
          title="Agents propose. Policies dispose."
          flip
          visual={<ApprovalVisual />}
        >
          <p>
            Policy rules gate every spawn — by cost, by capability, by whether it writes to the
            outside world. Risky actions pause in an approval inbox that{" "}
            <Em>agents cannot approve their way out of</Em>: releasing held work is a human-only
            permission.
          </p>
        </SplitRow>

        <SplitRow
          accent="rose"
          eyebrow="Evidence"
          title="The audit trail can only grow."
          visual={<LedgerVisual accent="rose" />}
        >
          <p>
            Ledger entries, receipts, and audit events are append-only — enforced by database
            triggers, not code review. <Em>UPDATE and DELETE are structurally impossible</Em>;
            corrections are new rows that say so.
          </p>
          <p>
            Every execution is reconstructable: who asked, what ran, what it touched, what it cost,
            down to the request id.
          </p>
        </SplitRow>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The control set</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" stagger={0.05}>
          {CONTROLS.map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-[14px] font-medium text-neutral-950">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </RevealGroup>
        <Reveal delay={0.1}>
          <p className="mt-8 text-sm text-neutral-400">
            Found something? We want to know first:{" "}
            <a href="mailto:security@swarms.dev" className="font-medium text-neutral-950 underline-offset-4 hover:underline">
              security@swarms.dev
            </a>
          </p>
        </Reveal>
      </section>

      <RelatedStrip slugs={["governance", "budgets", "spawn"]} />
      <CtaBand />
    </main>
  );
}
