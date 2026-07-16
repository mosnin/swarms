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
import { CeilingVisual, FanOutVisual } from "@/app/(marketing)/_components/visuals";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";

export const metadata: Metadata = {
  title: "Parallel swarms — Swarms",
  description:
    "Fan one request out to as many as 16 sandboxed workers — parallel or pipelined — and get back a single merged answer under one hard budget.",
};

export default function SwarmsFeaturePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="blue"
          eyebrow="Parallel swarms"
          title={
            <>
              One request in.
              <br />
              <TitleEm accent="blue">Sixteen workers out.</TitleEm>
            </>
          }
          lede="Split any decomposable job across up to 16 sandboxed workers — run them in parallel or as a pipeline — and get back one merged answer, streamed live, under one hard budget."
        >
          <div className="mx-auto max-w-2xl">
            <CodePane label="one call — a whole team">
              {`curl https://api.swarms.dev/api/v1/swarms \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -d '{
    "objective": "Tear down pricing for our 8 largest competitors",
    "tasks": ["acme", "northwind", "…"],
    "aggregatorTask": "Merge into one comparison table with a verdict",
    "budgetUsd": 2.00
  }'

# → 201 { "swarmId": "swm_4c1…", "workers": 8, "status": "running" }
# Eight readers. One table. One bill.`}
            </CodePane>
          </div>
        </StoryHero>
      </div>

      <BigStatement accentWords={["parallel", "budget", "merged"]}>
        Serial is a habit, not a law. A job with eight independent parts does not need one worker for eight hours — it needs eight workers for one. Swarms makes the fan-out a single request: parallel workers, one shared budget, one merged answer, and your afternoon handed back.
      </BigStatement>

      <section className="mx-auto max-w-6xl space-y-24 px-6 py-16 sm:space-y-32">
        <SplitRow
          accent="blue"
          eyebrow="Parallel or pipeline"
          title="Shape the team to the job, not the job to the team."
          visual={<FanOutVisual accent="blue" />}
        >
          <p>
            Some jobs shard cleanly — one worker per competitor, per file, per section. Others are
            assembly lines, where the edit needs the draft. Swarms runs both:{" "}
            <Em>up to 16 workers per run, fanned out in parallel or chained as a pipeline</Em>.
          </p>
          <p>
            Bigger shapes compose from the same parts. <Em>DAG workflows wire stages into arbitrary
            graphs</Em>, and any run can be replayed later — same structure, same inputs, new
            answer.
          </p>
        </SplitRow>

        <SplitRow
          accent="blue"
          eyebrow="The aggregator"
          title="Many outputs in. One answer out."
          flip
          visual={
            <CodePane label="watching the run live">
              {`GET /api/v1/swarms/swm_4c1…/events        # SSE

event: worker.completed   {"worker":3,"costUsd":0.19}
event: worker.completed   {"worker":7,"costUsd":0.22}
event: aggregator.started
event: swarm.completed    {"answer":"…","costUsd":1.74}

# or register a webhook — signed, retried until
# your endpoint acknowledges it`}
            </CodePane>
          }
        >
          <p>
            Sixteen raw outputs are not an answer — they are homework. So an optional aggregator
            worker gets every result and one job: <Em>merge it all into a single deliverable</Em> —
            a memo, a table, a verdict.
          </p>
          <p>
            You never poll in the dark. <Em>Progress streams over SSE as each worker finishes</Em>,
            and signed webhooks notify your systems the moment the merged answer lands.
          </p>
        </SplitRow>

        <SplitRow
          accent="blue"
          eyebrow="One shared ceiling"
          title="Sixteen workers. One budget. Zero surprises."
          visual={<CeilingVisual accent="blue" />}
        >
          <p>
            The swarm shares a single hard ceiling, reserved before anything runs. If one worker
            rabbit-holes, it is <Em>stopped at the line — the run degrades gracefully instead of
            the bill multiplying by sixteen</Em>.
          </p>
          <p>
            Underneath the cap, every worker is metered on its own. <Em>Each line of the bill names
            the worker that incurred it</Em>, so you know which part of the job cost what.
          </p>
        </SplitRow>
      </section>

      <Pull accent="blue" attribution="The mental model">
        Stop thinking “a smarter agent.” Start thinking “a team — assembled per request, sized to
        the job, disbanded the moment the answer merges.”
      </Pull>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">What that unlocks</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2" stagger={0.06}>
          <Point accent="blue" title="Afternoons become minutes">
            Eight competitors, eight workers, one comparison table. The wall-clock time is the
            slowest worker, not the sum of all of them.
          </Point>
          <Point accent="blue" title="Pipelines without glue code">
            Draft, edit, fact-check as sequential stages. The platform handles the handoffs — no
            queue you maintain, no cron duct tape.
          </Point>
          <Point accent="blue" title="Runs you can replay">
            The competitor teardown that worked in March runs again in April — same DAG, same
            tasks, fresh data, one call.
          </Point>
          <Point accent="blue" title="A bill itemized per worker">
            Per-worker metering under one shared cap. When finance asks why Tuesday cost $1.74,
            the answer is eight labeled line items.
          </Point>
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["spawn", "budgets", "research"]} />
      <CtaBand />
    </main>
  );
}
