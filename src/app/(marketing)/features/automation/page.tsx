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
import { ScheduleVisual } from "@/app/(marketing)/_components/visuals";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";

export const metadata: Metadata = {
  title: "Automation — Swarms",
  description:
    "Cron schedules that fire exactly once, signed webhooks with retries, evaluations that grade every output, and artifacts that keep the results.",
};

const EVAL_ROWS = [
  { criterion: "cites a source for every claim", score: "5/5" },
  { criterion: "flags anomalies above threshold", score: "5/5" },
  { criterion: "stays under 400 words", score: "4/5" },
  { criterion: "verdict", score: "pass" },
] as const;

export default function AutomationFeaturePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="cyan"
          eyebrow="Automation"
          title={
            <>
              Set the schedule.
              <br />
              <TitleEm accent="cyan">Skip the babysitting.</TitleEm>
            </>
          }
          lede="Cron schedules fire agents, swarms, and simulations with exactly-once semantics. Signed webhooks deliver the results, evaluations grade them, and artifacts keep them."
        >
          <div className="mx-auto max-w-2xl">
            <CodePane label="the morning report, institutionalized">
              {`curl https://api.swarms.dev/api/v1/schedules \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -d '{
    "cron": "0 6 * * 1-5",
    "target": { "kind": "swarm", "swarmId": "swm_report" },
    "budgetUsd": 0.75,
    "webhookUrl": "https://ops.example.com/hooks/report"
  }'

# → 201 { "scheduleId": "sch_2ab…", "nextFire": "Mon 06:00 UTC" }
# fires exactly once per tick — no doubles, no gaps`}
            </CodePane>
          </div>
        </StoryHero>
      </div>

      <BigStatement accentWords={["exactly-once", "grades", "signed"]}>
        The most valuable work is the work that happens again — the 6am report, the nightly sweep, the weekly teardown. Swarms runs it on a schedule with exactly-once semantics, grades every output against a rubric, and delivers results over signed webhooks. Recurring work should not require a recurring human.
      </BigStatement>

      <section className="mx-auto max-w-6xl space-y-24 px-6 py-16 sm:space-y-32">
        <SplitRow
          accent="cyan"
          eyebrow="Schedules"
          title="Cron that fires exactly once. Every time."
          visual={<ScheduleVisual accent="cyan" />}
        >
          <p>
            A schedule can fire anything on the platform — a single agent, a 16-worker swarm, a
            full market simulation. Each tick runs with <Em>exactly-once semantics: a redeployed
            worker or a flaky network never produces a duplicate run</Em>, and never drops one.
          </p>
          <p>
            Every tick is also a governed run. <Em>Each firing carries its own budget cap</Em>, so
            the report that runs 260 mornings a year costs what you decided — 260 times.
          </p>
        </SplitRow>

        <SplitRow
          accent="cyan"
          eyebrow="Webhooks & artifacts"
          title="Results that arrive signed and stay put."
          flip
          visual={
            <CodePane label="what lands on your endpoint">
              {`POST https://ops.example.com/hooks/report
X-Swarms-Signature: t=1768543200,v1=9f2c8a…

{
  "event": "run.completed",
  "runId": "run_7fe…",
  "costUsd": 0.61,
  "artifacts": ["art_5kq…"]
}

# retried with backoff until your endpoint acks
# artifacts stay downloadable for their retention window`}
            </CodePane>
          }
        >
          <p>
            When a run finishes, your systems hear about it on your terms: outbound webhooks are{" "}
            <Em>signed so you can verify the sender, and retried with backoff until acknowledged</Em>.
            A blip on your side delays delivery; it never loses it.
          </p>
          <p>
            The output itself becomes an artifact — <Em>a durable result file with a retention
            policy</Em>, not a payload that vanishes with the response. Thursday’s report is still
            there when the question arrives in June.
          </p>
        </SplitRow>

        <SplitRow
          accent="cyan"
          eyebrow="Evaluations & replay"
          title="Output that gets graded, then debugged."
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
                evaluation — morning-report rubric
              </p>
              <div className="mt-5 space-y-3">
                {EVAL_ROWS.map((row) => (
                  <div
                    key={row.criterion}
                    className="flex items-center gap-3 border-b border-neutral-100 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="min-w-0 flex-1 font-mono text-[11px] text-neutral-600">{row.criterion}</span>
                    <span
                      className={`font-mono text-[11px] font-semibold ${
                        row.score === "pass" ? "text-emerald-600" : "text-cyan-600"
                      }`}
                    >
                      {row.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            Unattended work needs an unattended reviewer. Evaluations score every output with{" "}
            <Em>an LLM judge grading against the rubric you wrote</Em> — sourcing, thresholds,
            length, whatever “good” means for this job — and the scores accumulate into a trend.
          </p>
          <p>
            When a score dips, you do not guess. <Em>Replay the run with overrides</Em> — a changed
            prompt, a different input — against the original as a controlled comparison, and ship
            the fix to the next tick.
          </p>
        </SplitRow>
      </section>

      <Pull accent="cyan" attribution="The mental model">
        Stop babysitting “a script on a box somewhere.” Start operating “a schedule that fires
        exactly once, grades its own output, and files the evidence.”
      </Pull>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">What that unlocks</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2" stagger={0.06}>
          <Point accent="cyan" title="Mornings start finished">
            The 6am swarm ran, the rubric passed, the webhook fired, the artifact filed — all
            before the first person logs on.
          </Point>
          <Point accent="cyan" title="Quality becomes a metric">
            Evaluation scores per run turn “is the automation still good?” into a chart — and a
            dip into a signal instead of a customer complaint.
          </Point>
          <Point accent="cyan" title="Failures announce themselves">
            Signed, retried webhooks mean your systems hear about every completion and every
            failure. Nobody polls a dashboard to find out.
          </Point>
          <Point accent="cyan" title="Debug by replay, not archaeology">
            Last Tuesday’s odd output re-runs with overrides against the original inputs. The
            diff answers in minutes what log-spelunking answers in days.
          </Point>
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["hosted-agents", "swarms", "operations"]} />
      <CtaBand />
    </main>
  );
}
