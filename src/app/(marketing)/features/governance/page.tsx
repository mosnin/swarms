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
import { ApprovalVisual } from "@/app/(marketing)/_components/visuals";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";

export const metadata: Metadata = {
  title: "Governance — Swarms",
  description:
    "Policy rules that decide what runs, a human approval inbox agents cannot touch, scoped keys, and an append-only audit trail of every action.",
};

const AUDIT_ROWS = [
  { ts: "14:02:11", actor: "agent:ops-analyst", action: "schedule.create" },
  { ts: "14:02:14", actor: "key:prod-mkt", action: "run.enqueue" },
  { ts: "14:03:02", actor: "dana@acme.com", action: "approval.grant" },
  { ts: "14:03:02", actor: "system", action: "run.release" },
] as const;

export default function GovernanceFeaturePage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="rose"
          eyebrow="Governance"
          title={
            <>
              Let agents act.
              <br />
              <TitleEm accent="rose">Stay in command.</TitleEm>
            </>
          }
          lede="Policy rules decide what runs, what is denied, and what waits for a human. Approvals land in an inbox agents cannot touch, and every mutation lands on an append-only audit trail."
        >
          <div className="mx-auto max-w-2xl">
            <CodePane label="the rules of engagement">
              {`POST /api/v1/policies
{
  "rules": [
    { "effect": "require_approval", "priority": 10,
      "conditions": { "externalWrite": true } },
    { "effect": "deny", "priority": 20,
      "conditions": { "estCostMinorGt": 2000 } },
    { "effect": "allow", "priority": 100 }
  ]
}

# reads run free · writes wait for a human · $20+ never runs`}
            </CodePane>
          </div>
        </StoryHero>
      </div>

      <BigStatement accentWords={["milliseconds", "denied", "human"]}>
        Autonomy is not the absence of rules — it is rules that execute faster than a meeting. Policies decide in milliseconds what runs, what is denied, and what waits for a person. And because the record of every action is append-only, the question of who did what always has one answer.
      </BigStatement>

      <section className="mx-auto max-w-6xl space-y-24 px-6 py-16 sm:space-y-32">
        <SplitRow
          accent="rose"
          eyebrow="Human approvals"
          title="The agent proposes. A person decides."
          visual={<ApprovalVisual accent="rose" />}
        >
          <p>
            Policy rules evaluate every action by priority, with conditions on cost, external
            writes, and more. When a rule says <Em>require_approval, the action holds — nothing
            sends, nothing spends — until a human releases it</Em> from the approval inbox.
          </p>
          <p>
            The inbox is structurally out of reach: <Em>agents cannot approve their own
            requests</Em>, or anyone else’s. The 240-email send waits for a name that belongs to a
            person.
          </p>
        </SplitRow>

        <SplitRow
          accent="rose"
          eyebrow="Scoped keys & roles"
          title="Least privilege, down to the API key."
          flip
          visual={
            <CodePane label="a key that can do exactly two things">
              {`POST /api/v1/keys
{
  "name": "marketing-agent",
  "role": "operator",
  "budgetMinor": 2000,
  "scopes": ["runs:create", "artifacts:read"]
}

# roles: owner · admin · developer · operator · viewer
# this key can spend $20 and do two things — nothing else`}
            </CodePane>
          }
        >
          <p>
            One master key behind a fleet of agents is one incident away from a very bad week.
            Swarms keys are scoped instruments: <Em>each carries its own permissions and its own
            budget</Em>, so a leaked key is a $20 problem, not an org-wide one.
          </p>
          <p>
            Above the keys sit five roles — owner, admin, developer, operator, viewer — and{" "}
            <Em>every query is isolated to your org at the data layer</Em>, not filtered as an
            afterthought in application code.
          </p>
        </SplitRow>

        <SplitRow
          accent="rose"
          eyebrow="The audit trail"
          title="Every mutation, written in ink."
          visual={
            <div className="rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-8 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
                audit trail — appended, never edited
              </p>
              <div className="mt-5 space-y-3">
                {AUDIT_ROWS.map((row) => (
                  <div
                    key={`${row.ts}-${row.action}`}
                    className="flex items-center gap-3 border-b border-neutral-100 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="w-16 shrink-0 font-mono text-[11px] text-neutral-400">{row.ts}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-rose-600">
                      {row.actor}
                    </span>
                    <span className="font-mono text-[11px] text-neutral-600">{row.action}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <p>
            Every mutation — a policy changed, a run enqueued, an approval granted — is written to
            an append-only audit trail with its actor and timestamp. <Em>Rows are added, never
            updated or deleted</Em>, so the history you read is the history that happened.
          </p>
          <p>
            When something goes sideways, the trail replaces the interrogation:{" "}
            <Em>who acted, under which key, approved by whom</Em> — answered by a query, in order,
            with nothing missing.
          </p>
        </SplitRow>
      </section>

      <Pull accent="rose" attribution="The mental model">
        Stop asking “what did the agents do?” after the incident. Start deciding “what agents may
        do” before the run — and let the audit trail hold the rest.
      </Pull>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">What that unlocks</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2" stagger={0.06}>
          <Point accent="rose" title="Autonomy you can ship to prod">
            The blocker was never capability — it was control. With deny rules and approval gates
            in front of every action, legal signs off.
          </Point>
          <Point accent="rose" title="Approvals without meetings">
            Risky actions queue in one inbox with full context attached. A human clears them in
            seconds, and everything else never waits.
          </Point>
          <Point accent="rose" title="Blast radius per key">
            Every integration gets its own scoped, budgeted key. Revoking one shuts down one
            agent — not your whole fleet.
          </Point>
          <Point accent="rose" title="Audits in minutes, not weeks">
            The compliance question “show us every external write in March” is a filter on an
            append-only table, not an archaeology project.
          </Point>
        </RevealGroup>
      </section>

      <RelatedStrip slugs={["budgets", "hosted-agents", "operations"]} />
      <CtaBand />
    </main>
  );
}
