import type { Metadata } from "next";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { Counter } from "@/app/(marketing)/_components/counter";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { RelatedStrip } from "@/app/(marketing)/_components/related-strip";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import {
  BigStatement,
  CodePane,
  Em,
  Pull,
  Scene,
  SceneList,
  StoryHero,
  TitleEm,
} from "@/app/(marketing)/_components/story";
import { ExtractionVisual, LedgerVisual } from "@/app/(marketing)/_components/visuals";

export const metadata: Metadata = {
  title: "Data extraction — Swarms",
  description:
    "Ten thousand scanned invoices, sixteen extraction workers, one validated table — and an honest exceptions queue for the forty it wasn't sure about.",
};

export default function DataUseCasePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="emerald"
          eyebrow="Use case · Data extraction"
          title={
            <>
              Ten thousand invoices.
              <br />
              <TitleEm accent="emerald">One clean table.</TitleEm>
            </>
          }
          lede="The quarter's vendor invoices arrive as scans — crooked, stamped, occasionally handwritten. Sixteen workers read them all before the second coffee, and confess to the ones they can't."
        />
      </div>

      <BigStatement accentWords={["sixteen", "same", "admit"]}>
        Nobody&apos;s judgment improves on invoice four thousand. Humans get slower and less careful as the pile grows. Sixteen workers read page one and page ten thousand with exactly the same attention — and admit it when they aren&apos;t sure.
      </BigStatement>

      {/* The story: one quarter-close morning, told hour by hour. */}
      <SceneList>
        <Scene
          accent="emerald"
          time="7:02 AM"
          title="The folder nobody wanted to open."
          visual={
            <CodePane label="one request — the whole backlog">
              {`POST /api/v1/swarms
{
  "objective": "Extract line items from Q2 vendor invoices",
  "inputArtifact": "invoices-q2.zip",  // 10,412 scanned PDFs
  "workers": 16,
  "outputSchema": {
    "vendor": "string", "invoiceNumber": "string",
    "issuedAt": "date", "totalMinorUnits": "int",
    "currency": "string"
  },
  "aggregatorTask": "Validate rows against the schema,
    dedupe, emit one table + an exceptions queue",
  "budgetUsd": 120.00
}`}
            </CodePane>
          }
        >
          <p>
            Quarter close. A finance analyst has 10,412 scanned PDFs and a warehouse table that
            needs them as rows. Instead of a data-entry vendor and a three-week wait,{" "}
            <Em>one API call with a schema attached</Em>. Totals come back in integer minor units —
            no floating-point money, ever.
          </p>
        </Scene>

        <Scene
          accent="emerald"
          time="7:03 AM"
          title="Sixteen readers, none of them bored."
          flip
          visual={<ExtractionVisual accent="emerald" />}
        >
          <p>
            The archive shards across sixteen sandboxed workers — roughly 650 invoices each,{" "}
            <Em>all reading at once</Em>. A worker on its 600th invoice is exactly as careful as it
            was on its first.
          </p>
          <p>
            Every row carries a confidence score. Below the threshold, a worker doesn&apos;t guess —{" "}
            <Em>it routes the document to an exceptions queue</Em> and moves on. The $120 ceiling is
            hard; the run can never cost more than the number in the request.
          </p>
        </Scene>

        <Scene
          accent="emerald"
          time="7:58 AM"
          title="One table, and an honest list of doubts."
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">exceptions queue · 40 of 10,412</p>
              <div className="mt-5 space-y-2.5">
                {[
                  { doc: "inv-0332.pdf", why: "handwritten total, low confidence" },
                  { doc: "inv-1187.pdf", why: "stamp covers the currency code" },
                  { doc: "inv-4720.pdf", why: "two totals on page — which is final?" },
                  { doc: "inv-9016.pdf", why: "possible duplicate of inv-8998" },
                ].map((r) => (
                  <div key={r.doc} className="flex items-center gap-3 border-b border-neutral-100 pb-2.5 last:border-0 last:pb-0">
                    <span className="w-24 shrink-0 font-mono text-[11px] font-semibold text-emerald-600">{r.doc}</span>
                    <span className="text-[13px] text-neutral-600">{r.why}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            Fifty-six minutes in, the aggregator hands back a validated, deduplicated table:{" "}
            <Em>10,372 rows that conform to the schema</Em>, every one traceable to the worker and
            the page it came from.
          </p>
          <p>
            And a queue of 40 it refused to guess on — handwritten totals, a stamp over the amount,
            a suspected duplicate. <Em>Each with the reason it was held</Em>, not just a blank.
          </p>
        </Scene>

        <Scene
          accent="emerald"
          time="9:15 AM"
          title="The audit trail wrote itself."
          flip
          visual={<LedgerVisual accent="emerald" />}
        >
          <p>
            The analyst clears the 40 exceptions by hand — <Em>the 0.4% that genuinely needed a
            human</Em> — and the table ships to the warehouse before the 10 AM close meeting.
          </p>
          <p>
            Beside it, the ledger: the hold, the metered GPU-seconds, the unused budget returned —
            append-only, line by line. When audit asks how a scanned stamp became a row,{" "}
            <Em>the answer is a job id and a receipt</Em>, not an intern&apos;s memory.
          </p>
        </Scene>
      </SceneList>

      <Pull accent="emerald" attribution="The uncomfortable math">
        The data-entry vendor quoted $0.19 per invoice and three weeks — about $1,978. This ran 56
        minutes and cost $84.10, and it told you exactly which 40 invoices it wasn&apos;t sure about.
        Vendors don&apos;t do that.
      </Pull>

      {/* Numbers strip */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-6 py-12 sm:px-12">
          <RevealGroup className="grid grid-cols-3 gap-6 text-center" stagger={0.08}>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={16} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">workers reading in parallel</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={56} suffix=" min" />
              </p>
              <p className="mt-2 text-sm text-neutral-500">10,412 scans to a validated table</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={40} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">exceptions routed to a human — 0.4%</p>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Beyond the one story */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The same shape, everywhere</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-neutral-950">
            Anywhere messy documents hide a clean table, a swarm wins.
          </h2>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-3 sm:grid-cols-3" stagger={0.06}>
          {[
            ["Contract abstraction", "Renewal dates, caps, and termination clauses pulled from a thousand PDFs into one register."],
            ["Claims intake", "Forms, photos, and adjuster notes structured into a case record the moment they arrive."],
            ["Resume screening", "Every application mapped to the same rubric — the 400th read as fairly as the 1st."],
            ["Catalog normalization", "Supplier spreadsheets in nine formats reconciled into one schema, with a diff per vendor."],
            ["Lab and field reports", "Handwritten readings and scanned tables digitized with confidence scores on every cell."],
            ["Email-to-order entry", "Purchase orders buried in inbox threads extracted, validated, and queued for approval."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-[15px] font-medium text-neutral-950">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["swarms", "budgets", "engineering"]} />
      <CtaBand />
    </main>
  );
}
