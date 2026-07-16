import type { Metadata } from "next";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { RelatedStrip } from "@/app/(marketing)/_components/related-strip";
import {
  BigStatement,
  CodePane,
  Em,
  Point,
  Pull,
  SplitRow,
  StoryHero,
  TitleEm,
} from "@/app/(marketing)/_components/story";
import { CeilingVisual, LedgerVisual } from "@/app/(marketing)/_components/visuals";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";

export const metadata: Metadata = {
  title: "Budgets & billing — Swarms",
  description:
    "Hard spending ceilings that physically stop runs, exactly-once charging, and an append-only double-entry ledger behind every dollar an agent spends.",
};

export default function BudgetsFeaturePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="amber"
          eyebrow="Budgets & billing"
          title={
            <>
              Every cent metered.
              <br />
              <TitleEm accent="amber">Every run capped.</TitleEm>
            </>
          }
          lede="Funds are reserved before a run starts, metered to the GPU-second while it works, charged exactly once when it ends, and receipted on a ledger nobody can edit."
        >
          <div className="mx-auto max-w-2xl">
            <CodePane label="money, made mechanical">
              {`curl https://api.swarms.dev/api/v1/budgets \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -d '{
    "scope": "key:prod-research",
    "limitMinor": 5000,
    "currency": "USD"
  }'

# $50.00, stored as 5000 — integer minor units, no floats.
# Every run under this key reserves funds before it starts.`}
            </CodePane>
          </div>
        </StoryHero>
      </div>

      <BigStatement accentWords={["stops", "once", "append-only"]}>
        An agent that can spend real money needs more than a dashboard. It needs a limit that physically stops it, a charge that lands exactly once, and a record nobody can edit afterward. Swarms treats money as an engineering problem — integer units, reserved funds, append-only books — not a reporting one.
      </BigStatement>

      <section className="mx-auto max-w-6xl space-y-24 px-6 py-16 sm:space-y-32">
        <SplitRow
          accent="amber"
          eyebrow="Hard-stop ceilings"
          title="A limit the platform enforces, not suggests."
          visual={<CeilingVisual accent="amber" />}
        >
          <p>
            Budget alerts arrive after the money is gone. Swarms budgets are enforcement:{" "}
            <Em>scoped to an org, an API key, or a schedule, with funds reserved before the run
            begins</Em>. If the reservation fails, nothing starts.
          </p>
          <p>
            While it runs, the meter is exact — <Em>$0.02 per GPU-second plus a 20% platform
            fee</Em>, counted against the ceiling in real time. At the line, the worker stops.
            The overage is zero because overage is impossible.
          </p>
        </SplitRow>

        <SplitRow
          accent="amber"
          eyebrow="The ledger"
          title="Double-entry, append-only, exactly once."
          flip
          visual={<LedgerVisual accent="amber" />}
        >
          <p>
            Every amount in the system is an integer in minor units — floating point is banned
            from monetary math. Every charge carries an idempotency key, so{" "}
            <Em>a retried request can never bill you twice</Em>: exactly-once is a property, not a
            promise.
          </p>
          <p>
            It all lands on a double-entry ledger that only grows. <Em>Holds, charges, releases,
            and receipts are appended, never updated</Em> — which means the books reconcile by
            construction.
          </p>
        </SplitRow>

        <SplitRow
          accent="amber"
          eyebrow="x402 & credits"
          title="Agents that can pay their own way."
          visual={
            <CodePane label="an agent buying what it needs">
              {`GET https://data.example.com/premium-dataset
← 402 Payment Required
   x402: { "amountMinor": 12, "currency": "USD" }

→ retried with payment attached
← 200 OK

# 12¢ drawn from prepaid credits, receipted on
# the ledger · credits auto-reload at your floor`}
            </CodePane>
          }
        >
          <p>
            The web is starting to price itself for machines. With x402, when a resource answers
            HTTP 402, <Em>your agent pays the quoted price from prepaid credits and proceeds</Em> —
            no human in the checkout flow, no card number in a prompt.
          </p>
          <p>
            Credits auto-reload at the floor you set, and every draw feeds spend analytics.{" "}
            <Em>Cost anomaly detection flags the run that spends unlike its history</Em> before it
            becomes a line item you have to explain.
          </p>
        </SplitRow>
      </section>

      <Pull accent="amber" attribution="The mental model">
        Stop discovering “what the agents spent.” Start declaring “what the agents may spend” —
        reserved up front, metered to the second, receipted forever.
      </Pull>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">What that unlocks</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2" stagger={0.06}>
          <Point accent="amber" title="No runaway loops">
            The retry storm at 3am hits its ceiling and stops. The worst case is a capped budget
            spent, never an uncapped bill discovered.
          </Point>
          <Point accent="amber" title="Books that reconcile themselves">
            Append-only double-entry means every balance is the sum of its history. Month-end
            close is a query, not an investigation.
          </Point>
          <Point accent="amber" title="Retries that never double-charge">
            Idempotency keys make charging exactly-once even when networks flake. Your agent can
            retry aggressively; your invoice cannot.
          </Point>
          <Point accent="amber" title="Anomalies before invoices">
            Spend analytics baseline every workload, and the run that costs 8x its history gets
            flagged today — not on next month’s statement.
          </Point>
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["spawn", "governance", "engineering"]} />
      <CtaBand />
    </main>
  );
}
