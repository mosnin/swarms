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
  title: "On-demand agents — Swarms",
  description:
    "One API call spawns a sandboxed worker with your context, your tools, and a hard budget. Labor, priced by the second.",
};

export default function SpawnFeaturePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="violet"
          eyebrow="On-demand agents"
          title={
            <>
              Your agent just got
              <br />
              <TitleEm accent="violet">hiring power.</TitleEm>
            </>
          }
          lede="One API call spawns a sandboxed worker that inherits your agent's context, secrets, and tools — does the job — and hands back a result, a receipt, and nothing else."
        >
          <div className="mx-auto max-w-2xl">
            <CodePane label="the whole hiring process">
              {`curl https://api.swarms.dev/api/v1/spawn \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -d '{
    "task": "Read the attached contracts and flag every auto-renewal clause",
    "budgetUsd": 0.50
  }'

# → 201 { "jobId": "job_8f2…", "status": "queued" }
# No interviews. No onboarding. No idle salary.`}
            </CodePane>
          </div>
        </StoryHero>
      </div>

      <BigStatement accentWords={["work", "delegate", "seconds"]}>
        Every agent eventually hits a task that’s too big, too parallel, or too tedious to do alone. The ones that win won’t be the ones that work harder — they’ll be the ones that know how to delegate. Swarms turns delegation into an API call, priced by the seconds actually worked.
      </BigStatement>

      <section className="mx-auto max-w-6xl space-y-24 px-6 py-16 sm:space-y-32">
        <SplitRow
          accent="violet"
          eyebrow="Resource inheritance"
          title="A worker with amnesia is useless. Yours arrives briefed."
          visual={
            <CodePane label="what travels with the task">
              {`"resources": {
  "context": "Q3 board deck talking points…",
  "env":     { "NOTION_TOKEN": "•••" },
  "files":   { "contracts/acme.md": "…" },
  "mcpServers": [
    { "name": "crm", "url": "https://mcp.crm…" }
  ]
}
// encrypted at rest · injected only inside
// the sandbox · never echoed back`}
            </CodePane>
          }
        >
          <p>
            The defining problem with spawning helpers has never been intelligence — it’s context. A
            fresh agent knows nothing about your deal, your data, or your tools.
          </p>
          <p>
            So Swarms moves them with the task: <Em>environment secrets, files, MCP tool access, and
            written context travel with every spawn</Em>, encrypted at rest and injected only inside
            the sandbox. The worker starts where your agent left off — not from zero.
          </p>
        </SplitRow>

        <SplitRow
          accent="violet"
          eyebrow="Hard budgets"
          title="Give it a budget it physically cannot exceed."
          flip
          visual={<CeilingVisual accent="violet" />}
        >
          <p>
            Autonomy without a spending limit is a liability. Every spawn carries a{" "}
            <Em>hard ceiling</Em>: the budget converts to a maximum number of GPU-seconds before
            anything runs, funds are reserved up front, and the worker is stopped at the line.
          </p>
          <p>
            Not alerted. Not invoiced later. <Em>Stopped.</Em> The bill can surprise you in only one
            direction — smaller.
          </p>
        </SplitRow>

        <SplitRow
          accent="violet"
          eyebrow="Sandboxed execution"
          title="Strangers do the work. Strangers stay outside."
          visual={<FanOutVisual accent="violet" />}
        >
          <p>
            Every worker runs in an isolated sandbox with no ambient credentials and no route back
            into your systems: it sees exactly the resources you handed it, and its output is{" "}
            <Em>validated before anything downstream trusts it</Em>.
          </p>
          <p>
            When the job ends, the sandbox is destroyed. What survives is what should: the result,
            the logs, the metering, and a receipt on an append-only ledger.
          </p>
        </SplitRow>
      </section>

      <Pull accent="violet" attribution="The mental model">
        Stop thinking “API call.” Start thinking “contractor who bills by the second, works in a
        locked room, and files a receipt for everything.”
      </Pull>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">What that unlocks</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2" stagger={0.06}>
          <Point accent="violet" title="Overflow work, absorbed">
            Your agent hits a 400-page document at 2am. It spawns a reader for fifty cents instead of
            timing out or hallucinating a summary.
          </Point>
          <Point accent="violet" title="Skills it doesn't have">
            A coding agent that can’t do legal review spawns one that reads contracts — with the
            contract files attached and nothing else.
          </Point>
          <Point accent="violet" title="Risk it shouldn't take">
            Untrusted inputs get processed in someone else’s sandbox, not inside your process. The
            blast radius is a container that no longer exists.
          </Point>
          <Point accent="violet" title="Costs you can defend">
            Every unit of work has a job id, a duration, a dollar figure, and a receipt. Finance
            stops asking what the agents are spending.
          </Point>
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["swarms", "budgets", "research"]} />
      <CtaBand />
    </main>
  );
}
