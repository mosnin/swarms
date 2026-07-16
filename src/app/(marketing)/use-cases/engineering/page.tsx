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
import { ApprovalVisual, FanOutVisual } from "@/app/(marketing)/_components/visuals";

export const metadata: Metadata = {
  title: "Engineering — Swarms",
  description:
    "A deprecated API with 300 call sites, one worker per module, evaluations scoring every diff — and a human reviewing only the twelve that earned it.",
};

export default function EngineeringUseCasePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="amber"
          eyebrow="Use case · Engineering"
          title={
            <>
              Three hundred call sites.
              <br />
              <TitleEm accent="amber">One afternoon.</TitleEm>
            </>
          }
          lede="The billing-v1 client was deprecated two quarters ago. Three hundred call sites still use it, because no engineer has a spare month. A swarm has sixteen spare hours — all at once."
        />
      </div>

      <BigStatement accentWords={["stall", "sixteen", "dozen"]}>
        Migrations don&apos;t stall because they are hard. They stall because they are three hundred small chores wearing one big ticket. Split the ticket across sixteen workers and the chore part disappears — what remains is the dozen decisions that actually need an engineer.
      </BigStatement>

      {/* The story: one migration afternoon, told hour by hour. */}
      <SceneList>
        <Scene
          accent="amber"
          time="9:30 AM"
          title="The ticket everyone routed around."
          visual={
            <CodePane label="one request — the whole migration">
              {`POST /api/v1/swarms
{
  "objective": "Migrate every caller of billing-v1
    to the v2 client",
  "tasks": [
    "Rewrite call sites in modules/invoices (31 sites)",
    "Rewrite call sites in modules/payouts (24 sites)",
    "…one worker per module — 16 modules, 300 sites"
  ],
  "evaluation": "Per diff: types pass, tests pass,
    no behavior change against the fixture suite",
  "aggregatorTask": "One branch per module; flag any
    diff scoring below 0.9",
  "budgetUsd": 10.00
}`}
            </CodePane>
          }
        >
          <p>
            An engineer opens the migration ticket that has survived four sprint plannings, and
            closes it differently this time: <Em>one request, one worker per module, and a rubric
            that defines what “done” means</Em>. The migration guide rides along as context.
          </p>
        </Scene>

        <Scene
          accent="amber"
          time="9:32 AM"
          title="Sixteen branches grow at once."
          flip
          visual={<FanOutVisual accent="amber" />}
        >
          <p>
            Each worker gets a sandboxed checkout, its own module, and nothing else. They rewrite
            call sites, run the module&apos;s tests, and adjust until green —{" "}
            <Em>simultaneously, in sixteen isolated sandboxes</Em>, never inside anyone&apos;s dev
            machine.
          </p>
          <p>
            The $10 ceiling is a hard line across the run. A worker stuck in a test loop gets
            stopped at its share — <Em>a stalled module costs cents, not the afternoon</Em>.
          </p>
        </Scene>

        <Scene
          accent="amber"
          time="10:20 AM"
          title="The judge reads every diff."
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">evaluation scores · 16 modules</p>
              <div className="mt-5 space-y-2.5">
                {[
                  { mod: "modules/invoices", score: "0.97", verdict: "pass", tone: "text-emerald-600" },
                  { mod: "modules/payouts", score: "0.95", verdict: "pass", tone: "text-emerald-600" },
                  { mod: "modules/webhooks", score: "0.93", verdict: "pass", tone: "text-emerald-600" },
                  { mod: "modules/refunds", score: "0.71", verdict: "flagged — retry semantics changed", tone: "text-amber-600" },
                ].map((r) => (
                  <div key={r.mod} className="flex items-center gap-3 border-b border-neutral-100 pb-2.5 last:border-0 last:pb-0">
                    <span className="w-36 shrink-0 font-mono text-[11px] text-neutral-600">{r.mod}</span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-neutral-950">{r.score}</span>
                    <span className={`min-w-0 truncate font-mono text-[11px] font-medium ${r.tone}`}>{r.verdict}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            An evaluation scores every diff against the rubric: types pass, tests pass, behavior
            unchanged against the fixtures. <Em>288 call sites clear the bar. Twelve don&apos;t</Em> —
            ambiguous retry semantics, a hand-rolled mock, one module where v2 has no equivalent
            endpoint.
          </p>
          <p>
            The point isn&apos;t that machines review machines. It&apos;s that{" "}
            <Em>the human&apos;s attention is spent only where the judge lost confidence</Em>.
          </p>
        </Scene>

        <Scene
          accent="amber"
          time="2:40 PM"
          title="Nothing merges itself."
          flip
          visual={<ApprovalVisual accent="amber" />}
        >
          <p>
            Opening pull requests against the repo is an external write, so{" "}
            <Em>every branch holds until the engineer approves it</Em> — policy, not etiquette. She
            reads the twelve flagged diffs closely, fixes two by hand, and releases the rest
            module by module.
          </p>
          <p>
            By the end of the afternoon the deprecation is a merged set of PRs with{" "}
            <Em>an append-only record of who approved what, and when</Em>.
          </p>
        </Scene>
      </SceneList>

      <Pull accent="amber" attribution="The uncomfortable math">
        The ticket was scoped at an engineer-month — call it $15,000 of salary nobody could spare.
        Sixteen workers rewrote 300 call sites in 50 minutes for $6.80, and the engineer spent one
        afternoon on the twelve diffs that deserved an engineer.
      </Pull>

      {/* Numbers strip */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-amber-50 via-white to-orange-50 px-6 py-12 sm:px-12">
          <RevealGroup className="grid grid-cols-3 gap-6 text-center" stagger={0.08}>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={300} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">call sites migrated in parallel</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={12} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">diffs flagged for human review</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={6.8} prefix="$" decimals={2} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">total, against a $10 hard cap</p>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Beyond the one story */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The same shape, everywhere</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-neutral-950">
            Anywhere the backlog is many small diffs, a swarm wins.
          </h2>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-3 sm:grid-cols-3" stagger={0.06}>
          {[
            ["Dependency upgrades", "One worker per package bump — each with its changelog read and its test suite run."],
            ["Test backfill", "Uncovered modules get a worker each; evaluations reject tests that merely assert the mock."],
            ["Lint-debt paydown", "Ten thousand warnings sharded by directory and cleared without a human touching one."],
            ["Dead-code sweeps", "Every suspected-unused export traced across the repo before a removal PR is proposed."],
            ["Incident repro hunts", "Sixteen hypotheses about a flaky failure tested in parallel sandboxes overnight."],
            ["First-pass PR review", "Each open PR gets a worker: style, tests, and risky-diff flags before a human looks."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-[15px] font-medium text-neutral-950">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["automation", "governance", "data"]} />
      <CtaBand />
    </main>
  );
}
