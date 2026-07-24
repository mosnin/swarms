import type { Metadata } from "next";

import { CodeBlock } from "@/app/(marketing)/docs/_components/code-block";
import { DocsShell, nextAfter } from "@/app/(marketing)/docs/_components/docs-shell";
import { C, P, Section } from "@/app/(marketing)/docs/_components/section";

export const metadata: Metadata = { title: "Billing & budgets — Swarms Docs" };

const TOC = [
  { id: "units", label: "Money is minor units" },
  { id: "ledger", label: "The ledger" },
  { id: "budgets", label: "Budgets & hard stops" },
  { id: "idempotency", label: "Exactly-once charging" },
  { id: "balance", label: "Balance & usage" },
];

export default function BillingDocsPage() {
  return (
    <DocsShell
      eyebrow="Billing & budgets"
      title={
        <>
          Every cent, <span className="font-semibold">accounted for.</span>
        </>
      }
      lede="Swarms is a paid execution layer, so money is a first-class, auditable primitive — integer minor units on a double-entry, append-only ledger, with hard ceilings that a run physically cannot exceed."
      toc={TOC}
      next={nextAfter("/docs/billing")}
    >
      <Section id="units" n="01" title="Money is integer minor units">
        <P>
          Every amount is an integer count of the currency&apos;s minor unit (e.g. cents) plus an ISO-4217 code.
          Floating point is never used for monetary math — <C>budgetMinor: 250</C> is $2.50 USD. This
          removes rounding drift from the entire system.
        </P>
        <CodeBlock label="json">{`{ "amountMinor": 250, "currency": "USD" }   // = $2.50`}</CodeBlock>
      </Section>

      <Section id="ledger" n="02" title="The ledger">
        <P>
          Balance is not a mutable number — it is <C>sum(credits) − sum(debits)</C> over an append-only
          ledger. A prepaid top-up is a credit; every metered charge is a debit linked to the job that
          incurred it. Entries are never updated or deleted, so the balance is always reconstructable and
          every movement is attributable.
        </P>
      </Section>

      <Section id="budgets" n="03" title="Budgets & hard stops">
        <P>
          A budget caps spend over a period (daily, weekly, monthly, or once). With <C>hardStop</C> on, a
          run that would breach the cap is refused before it starts — the ceiling is enforced at
          reservation time, not discovered after the money is spent. Per-job <C>budgetMinor</C> and
          per-wake <C>budgetMinorPerWake</C> are hard ceilings on a single run.
        </P>
      </Section>

      <Section id="idempotency" n="04" title="Exactly-once charging">
        <P>
          Every paid action carries an idempotency key. A retried request with the same key returns the
          original result and never charges twice; at the ledger, a partial unique index makes each
          job&apos;s charge exactly-once even under concurrent workers. Retrying is always safe.
        </P>
        <CodeBlock label="header">{`Idempotency-Key: 8f3c…   # same key ⇒ same result, charged once`}</CodeBlock>
      </Section>

      <Section id="balance" n="05" title="Balance & usage">
        <P>Read the available balance per currency, or spend analytics with burn rate and projected runway.</P>
        <CodeBlock label="reference">{`GET /api/v1/billing/balance             # [{ currency, balanceMinor }]
GET /api/v1/billing/usage?sinceDays=30  # total, daily burn, runway, by-day`}</CodeBlock>
      </Section>
    </DocsShell>
  );
}
