import type { Metadata } from "next";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { Counter } from "@/app/(marketing)/_components/counter";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { RelatedStrip } from "@/app/(marketing)/_components/related-strip";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import {
  BigStatement,
  Em,
  Pull,
  Scene,
  SceneList,
  StoryHero,
  TitleEm,
} from "@/app/(marketing)/_components/story";
import { InboxWakeVisual, LedgerVisual, ScheduleVisual } from "@/app/(marketing)/_components/visuals";

export const metadata: Metadata = {
  title: "Operations — Swarms",
  description:
    "A hosted agent that watches overnight — triages alerts, drafts the incident timeline, files the 6 AM report — and costs almost nothing while nothing happens.",
};

export default function OperationsUseCasePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="cyan"
          eyebrow="Use case · Operations"
          title={
            <>
              The night shift
              <br />
              <TitleEm accent="cyan">that sleeps when you can.</TitleEm>
            </>
          }
          lede="An ops team deploys one hosted agent against the alert stream. It wakes when something happens, does the first twenty minutes of every response, and bills only for the moments it was awake."
        />
      </div>

      <BigStatement accentWords={["vigil", "nothing", "instantly"]}>
        An on-call rotation pays a human to sleep badly next to a laptop. Most nights nothing happens — the cost is the vigil, not the work. A hosted agent inverts that. It costs nothing until something happens, then does the first twenty minutes of the response instantly.
      </BigStatement>

      {/* The story: one night on watch, told hour by hour. */}
      <SceneList>
        <Scene
          accent="cyan"
          time="1:13 AM"
          title="The pager fires. Nobody wakes up."
          visual={<InboxWakeVisual accent="cyan" />}
        >
          <p>
            A p99 latency alert lands on the checkout service. The hosted agent —{" "}
            <Em>deployed once, subscribed to the alert stream, asleep since 11 PM</Em> — wakes on
            the message. No polling loop, no idle server humming all night for this moment.
          </p>
          <p>
            It pulls the graphs, the recent deploys, and the runbook. The SRE on call is still
            asleep, which tonight is the correct state for an SRE.
          </p>
        </Scene>

        <Scene
          accent="cyan"
          time="1:16 AM"
          title="The first twenty minutes, done in three."
          flip
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">incident draft · inc-2214</p>
              <div className="mt-5 space-y-2.5">
                {[
                  { t: "01:13", line: "p99 latency alert — checkout service" },
                  { t: "01:14", line: "correlated: cache-node restart at 01:09" },
                  { t: "01:15", line: "runbook matched: cache stampede, § 4" },
                  { t: "01:16", line: "timeline drafted · rollback held for approval" },
                ].map((r) => (
                  <div key={r.t} className="flex items-center gap-3 border-b border-neutral-100 pb-2.5 last:border-0 last:pb-0">
                    <span className="w-12 shrink-0 font-mono text-[11px] font-semibold text-cyan-600">{r.t}</span>
                    <span className="text-[13px] text-neutral-600">{r.line}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            The agent does the part of incident response that is reading, not judgment: it
            correlates the alert with a cache-node restart four minutes earlier, matches the
            runbook, and <Em>drafts the incident timeline while the incident is still young</Em>.
          </p>
          <p>
            The one risky action — restarting the cache tier — is an external write, so it&apos;s{" "}
            <Em>held for approval, not fired into production at 1 AM</Em>. The metrics recover on
            their own by 1:31. Nobody was paged.
          </p>
        </Scene>

        <Scene
          accent="cyan"
          time="6:00 AM"
          title="The morning report files itself."
          visual={<ScheduleVisual accent="cyan" />}
        >
          <p>
            A schedule fires at six, every day, whether the night was quiet or not. The report is
            already structured: <Em>31 alerts overnight, 29 correlated to known noise and
            annotated, 2 promoted to incidents</Em> — each with a drafted timeline and the held
            actions listed.
          </p>
          <p>
            The team reads it with coffee instead of reconstructing the night from dashboards.
          </p>
        </Scene>

        <Scene
          accent="cyan"
          time="9:02 AM"
          title="The bill for a night of cover."
          flip
          visual={<LedgerVisual accent="cyan" />}
        >
          <p>
            The ledger tells the whole night in four kinds of rows: the agent woke five times, ran
            about two minutes of metered compute in total, and{" "}
            <Em>the eight idle hours in between cost exactly nothing</Em>.
          </p>
          <p>
            Every triage note, held action, and the 6 AM report itself is on the append-only
            trail. When the postmortem asks what was known at 1:16, <Em>the answer is a receipt,
            not a recollection</Em>.
          </p>
        </Scene>
      </SceneList>

      <Pull accent="cyan" attribution="The uncomfortable math">
        An outsourced overnight NOC starts around $3,000 a month. Last night&apos;s cover triaged 31
        alerts, documented two incidents, and filed the report at 6:00 sharp — for $2.88. The hours
        where nothing happened cost what nothing should.
      </Pull>

      {/* Numbers strip */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl bg-gradient-to-br from-cyan-50 via-white to-sky-50 px-6 py-12 sm:px-12">
          <RevealGroup className="grid grid-cols-3 gap-6 text-center" stagger={0.08}>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={31} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">alerts triaged overnight</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={2} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">real incidents, timelines drafted</p>
            </div>
            <div>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-neutral-950 sm:text-5xl">
                <Counter value={2.88} prefix="$" decimals={2} />
              </p>
              <p className="mt-2 text-sm text-neutral-500">the whole night, on the ledger</p>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Beyond the one story */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The same shape, everywhere</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-neutral-950">
            Anywhere someone is paid to watch and wait, a hosted agent wins.
          </h2>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-3 sm:grid-cols-3" stagger={0.06}>
          {[
            ["Queue and backlog watch", "Support, review, and approval queues monitored; the aging ones escalated with context."],
            ["Vendor status tracking", "Third-party status pages and webhooks watched so your customers never tell you first."],
            ["Nightly reconciliation", "Payments matched against the ledger each night; only the mismatches reach a human."],
            ["Certificate and quota patrol", "Expiring certs, filling disks, and rate-limit ceilings flagged weeks early, on schedule."],
            ["Release-night cover", "An agent watches error budgets after each deploy and drafts the rollback request itself."],
            ["Daily standup brief", "Tickets, merges, and alerts from the last 24 hours condensed before the team sits down."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-[15px] font-medium text-neutral-950">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["hosted-agents", "automation", "research"]} />
      <CtaBand />
    </main>
  );
}
