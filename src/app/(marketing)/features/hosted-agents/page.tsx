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
import { InboxWakeVisual, ScheduleVisual } from "@/app/(marketing)/_components/visuals";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";

export const metadata: Metadata = {
  title: "Hosted agents — Swarms",
  description:
    "Deploy a persistent agent in one click. It keeps durable memory, wakes when a message lands, and costs almost nothing while it sleeps.",
};

export default function HostedAgentsFeaturePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="emerald"
          eyebrow="Hosted agents"
          title={
            <>
              Deploy an agent that
              <br />
              <TitleEm accent="emerald">remembers yesterday.</TitleEm>
            </>
          }
          lede="One click deploys a persistent agent with its own identity, durable memory, and an inbox. It wakes when a message arrives, works under a metered budget, and goes back to costing nothing."
        >
          <div className="mx-auto max-w-2xl">
            <CodePane label="the whole onboarding">
              {`curl https://api.swarms.dev/api/v1/agents \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -d '{
    "template": "hermes",
    "name": "ops-analyst",
    "wakeBudgetUsd": 0.25
  }'

# → 201 { "agentId": "agt_9d4…", "status": "idle" }
# Hired in one call. Asleep until needed.`}
            </CodePane>
          </div>
        </StoryHero>
      </div>

      <BigStatement accentWords={["memory", "wakes", "staff"]}>
        Most agents are goldfish — brilliant for one request, blank by the next. A hosted agent has a name, a memory, and an inbox. It recalls Tuesday’s decision on Wednesday, wakes the moment a message lands, and costs almost nothing in between. That is not a function call. That is staff.
      </BigStatement>

      <section className="mx-auto max-w-6xl space-y-24 px-6 py-16 sm:space-y-32">
        <SplitRow
          accent="emerald"
          eyebrow="Durable memory"
          title="It remembers Tuesday on Wednesday."
          visual={
            <CodePane label="talking to a colleague, not a session">
              {`POST /api/v1/agents/agt_9d4…/messages
{
  "content": "Same report as yesterday,
              but add the churn numbers."
}

# "Same as yesterday" just works — yesterday lives
# in Postgres, not in a context window that
# expired at midnight.`}
            </CodePane>
          }
        >
          <p>
            Stateless agents make you the memory: every session starts with you re-explaining the
            project. A hosted agent carries a <Em>persistent identity and durable memory stored in
            Postgres</Em> — decisions, preferences, and open threads survive every restart.
          </p>
          <p>
            The interface is a message, not a prompt. <Em>POST to its inbox and the reply builds on
            everything that came before</Em>, the way the third week with a colleague beats the
            first day.
          </p>
        </SplitRow>

        <SplitRow
          accent="emerald"
          eyebrow="Wakes, works, sleeps"
          title="Always on call. Almost never on the clock."
          flip
          visual={<InboxWakeVisual accent="emerald" />}
        >
          <p>
            The agent wakes on two triggers: a message in its inbox, or a heartbeat you configure.
            Between wakes it holds no compute — <Em>an idle agent costs approximately nothing</Em>,
            the way an employee off shift costs no overtime.
          </p>
          <p>
            Every wake is a real run with real controls: <Em>metered to the GPU-second and capped
            by a per-wake budget</Em>. A stuck task stops at its ceiling instead of burning
            through the night.
          </p>
        </SplitRow>

        <SplitRow
          accent="emerald"
          eyebrow="Employer controls"
          title="Pause it, resume it, read its payroll."
          visual={<ScheduleVisual accent="emerald" />}
        >
          <p>
            You stay the employer. <Em>Pause, resume, or terminate any agent in one call</Em> — a
            paused agent keeps its memory and answers nothing until you say otherwise.
          </p>
          <p>
            And the payroll is itemized: <Em>every dollar is attributed to the specific agent that
            spent it</Em>, wake by wake. When one costs more than it returns, the numbers say so
            before you have to guess.
          </p>
        </SplitRow>
      </section>

      <Pull accent="emerald" attribution="The mental model">
        Stop renting “a model you re-brief every session.” Start employing “a colleague who read
        yesterday’s thread and answers before you are back at your desk.”
      </Pull>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">What that unlocks</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2" stagger={0.06}>
          <Point accent="emerald" title="Standing roles, staffed">
            An ops analyst that owns the morning report. A triage agent that owns the support
            queue. Deployed once, on duty indefinitely.
          </Point>
          <Point accent="emerald" title="Context that compounds">
            Week three beats week one because nothing was forgotten in between. The agent gets
            more useful the longer it holds the job.
          </Point>
          <Point accent="emerald" title="Idle costs that round to zero">
            You pay for wakes, not uptime. An agent that answers forty messages a month bills like
            forty small runs — not like a server.
          </Point>
          <Point accent="emerald" title="Accountability per agent">
            Per-agent spend attribution turns “what are the agents costing us” into a table with
            names on it — and a pause button next to each.
          </Point>
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["automation", "governance", "operations"]} />
      <CtaBand />
    </main>
  );
}
