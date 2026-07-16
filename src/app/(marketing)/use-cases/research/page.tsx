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
import { FanOutVisual, LedgerVisual } from "@/app/(marketing)/_components/visuals";

export const metadata: Metadata = {
  title: "Deep research — Swarms",
  description:
    "Due diligence that used to take an analyst a week, done in parallel before lunch — with a receipt for every source read.",
};

export default function ResearchUseCasePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="violet"
          eyebrow="Use case · Deep research"
          title={
            <>
              A week of diligence.
              <br />
              <TitleEm accent="violet">Done before lunch.</TitleEm>
            </>
          }
          lede="The bottleneck in research was never reading speed — it was that one person can only read one thing at a time. Swarms removes the 'one person' part."
        />
      </div>

      <BigStatement accentWords={["twelve", "parallel", "once"]}>
        A diligence brief has twelve threads — the market, the team, the filings, the competitors, the customers, the lawsuits. A human works them one by one and the picture arrives in pieces. A swarm works them in parallel and the picture arrives at once.
      </BigStatement>

      {/* The story: one morning, told hour by hour. */}
      <SceneList>
        <Scene
          accent="violet"
          time="9:12 AM"
          title="The brief lands."
          visual={
            <CodePane label="one request — the whole engagement">
              {`POST /api/v1/swarms
{
  "objective": "Should we lead the Series B in Meridian Robotics?",
  "tasks": [
    "Map the warehouse-robotics market and its 3 largest players",
    "Profile the founding team, prior exits, and key departures",
    "Summarize all public filings, patents, and litigation",
    "Collect customer sentiment from reviews and forums",
    "Stress-test the pricing model against competitors",
    "Draft the bear case — argue AGAINST the deal"
  ],
  "aggregatorTask": "Merge into an investment memo with a clear recommendation",
  "budgetUsd": 4.00
}`}
            </CodePane>
          }
        >
          <p>
            A partner forwards the deal. Your agent doesn’t open forty tabs — it{" "}
            <Em>writes six research briefs and files one API call</Em>. Note the last task: one
            worker’s entire job is to argue against the deal. Try staffing that with humans who
            all want the deal to close.
          </p>
        </Scene>

        <Scene
          accent="violet"
          time="9:13 AM"
          title="Six analysts clock in."
          flip
          visual={<FanOutVisual accent="violet" />}
        >
          <p>
            Each task becomes a sandboxed worker with the deal context attached. They read filings,
            crawl reviews, and pull market data <Em>simultaneously — nobody waits for anybody</Em>.
          </p>
          <p>
            The budget is a hard $4.00 ceiling across the whole run. If a worker rabbit-holes, it
            gets stopped at its share of the line — the run degrades gracefully instead of the bill
            exploding.
          </p>
        </Scene>

        <Scene
          accent="violet"
          time="9:41 AM"
          title="One memo comes back. With receipts."
          visual={<LedgerVisual accent="violet" />}
        >
          <p>
            The aggregator merges six streams into one investment memo: recommendation up top, bear
            case given its own section, every claim traceable to the worker that produced it.
          </p>
          <p>
            Beside it, the ledger: <Em>what ran, for how long, for how much</Em> — line by line,
            append-only. When the IC asks “where did this number come from?”, the answer is a job id,
            not a shrug.
          </p>
        </Scene>

        <Scene
          accent="violet"
          time="10:15 AM"
          title="The human does the human part."
          flip
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">the division of labor</p>
              <div className="mt-5 space-y-3">
                {[
                  { who: "swarm", did: "read 1,400 pages, 6 threads, in parallel", tone: "text-violet-600" },
                  { who: "swarm", did: "drafted the memo + the bear case", tone: "text-violet-600" },
                  { who: "you", did: "challenged the thesis", tone: "text-neutral-950" },
                  { who: "you", did: "made the call", tone: "text-neutral-950" },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
                    <span className={`w-14 font-mono text-[11px] font-semibold ${r.tone}`}>{r.who}</span>
                    <span className="text-[14px] text-neutral-600">{r.did}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            By 10:15 the partner is doing the only work that ever needed a partner:{" "}
            <Em>judging the argument</Em>. The reading, collating, and first-drafting — the week of
            it — happened while the coffee was still warm.
          </p>
        </Scene>
      </SceneList>

      <Pull accent="violet" attribution="The uncomfortable math">
        An analyst-week costs a few thousand dollars and arrives Friday. This ran for 28 minutes and
        cost $3.61 — and the bear case was the best-argued section in the memo.
      </Pull>

      {/* Numbers strip */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-violet-50 via-white to-blue-50 px-6 py-12 sm:px-12">
          <RevealGroup className="grid grid-cols-3 gap-6 text-center" stagger={0.08}>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={6} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">threads researched at once</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={28} suffix=" min" />
              </p>
              <p className="mt-2 text-sm text-neutral-500">brief to finished memo</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={3.61} prefix="$" decimals={2} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">total, ledgered to the second</p>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Beyond the one story */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The same shape, everywhere</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-neutral-950">
            Anywhere the job is “read a lot, think a little,” a swarm wins.
          </h2>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-3 sm:grid-cols-3" stagger={0.06}>
          {[
            ["Competitive teardowns", "One worker per competitor. Every pricing page, changelog, and job posting — weekly."],
            ["Literature reviews", "Forty papers, one worker each, merged into a single methods-aware synthesis."],
            ["RFP & vendor analysis", "Each proposal scored against the same rubric by workers that never get tired on page 60."],
            ["Regulatory scans", "New rules across nine jurisdictions, summarized with citations before the team logs on."],
            ["Expert-call prep", "Everything a guest has ever said or published, briefed into ten sharp questions."],
            ["Post-mortem evidence", "Logs, tickets, and threads read in parallel; a timeline with sources, not vibes."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-[15px] font-medium text-neutral-950">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["swarms", "budgets", "simulations"]} />
      <CtaBand />
    </main>
  );
}
