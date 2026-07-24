import type { Metadata } from "next";

import { CodeBlock } from "@/app/(marketing)/docs/_components/code-block";
import { DocsShell, nextAfter } from "@/app/(marketing)/docs/_components/docs-shell";
import { C, P, Section } from "@/app/(marketing)/docs/_components/section";

export const metadata: Metadata = { title: "Hosted agents — Swarms Docs" };

const TOC = [
  { id: "deploy", label: "Deploy an agent" },
  { id: "wake", label: "How it wakes" },
  { id: "messages", label: "Message it" },
  { id: "thread", label: "Read the thread" },
  { id: "lifecycle", label: "Pause & terminate" },
  { id: "cost", label: "What it costs" },
  { id: "events", label: "Events" },
];

export default function AgentsDocsPage() {
  return (
    <DocsShell
      eyebrow="Hosted agents"
      title={
        <>
          A persistent agent, <span className="font-semibold">deployed in one call.</span>
        </>
      }
      lede="A hosted agent is a durable identity in Postgres — config, versioned memory, an inbox. Execution is discrete wake jobs through the normal spawn path, so every wake is policy-gated, hard-ceiling reserved, and exactly-once charged."
      toc={TOC}
      next={nextAfter("/docs/agents")}
    >
      <Section id="deploy" n="01" title="Deploy an agent">
        <P>
          Give it a name, standing instructions, and a per-wake budget. Add{" "}
          <C>wakeIntervalMinutes</C> (5–1440) for a heartbeat, or omit it for an agent that wakes only when
          messaged.
        </P>
        <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/agents \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Inbox Concierge",
    "instructions": "Triage inbound email and reply briefly.",
    "wakeIntervalMinutes": 60,
    "budgetMinorPerWake": 200
  }'

# → 201 { "agent": { "id": "agi_…", "status": "active", … } }`}</CodeBlock>
      </Section>

      <Section id="wake" n="02" title="How it wakes">
        <P>
          A wake is triggered by an inbound message (immediately) or the heartbeat interval. Each wake is
          claimed with the same compare-and-set pattern as scheduled runs, so concurrent workers never
          double-wake. The agent runs as a budget-capped job; when it finishes, its reply is folded back
          into durable memory and the thread.
        </P>
      </Section>

      <Section id="messages" n="03" title="Message it">
        <P>
          Post a message and the agent wakes to handle it as a charged job. The call returns{" "}
          <C>202 Accepted</C> with the recorded message.
        </P>
        <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/agents/agi_.../messages \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "content": "Any customer emails before standup?" }'

# → 202 { "message": { "id": "agm_…", "role": "user", … } }`}</CodeBlock>
      </Section>

      <Section id="thread" n="04" title="Read the thread">
        <P>
          The message thread is keyset-paginated, newest first. Pass the returned <C>nextCursor</C> to fetch
          the next (older) page; a null cursor ends the thread.
        </P>
        <CodeBlock label="curl">{`GET /api/v1/agents/agi_.../messages?limit=30
# → { "messages": [ … ], "nextCursor": "eyJ…" | null }

GET /api/v1/agents/agi_.../messages?limit=30&cursor=eyJ…`}</CodeBlock>
      </Section>

      <Section id="lifecycle" n="05" title="Pause, resume, terminate">
        <P>
          Pause halts wakes without losing memory; resume reschedules the heartbeat. Terminate is
          permanent. A <C>suspended</C> agent (a billing action) can only be reinstated by the platform, not
          by resume.
        </P>
        <CodeBlock label="reference">{`POST   /api/v1/agents/agi_.../pause     # stop waking, keep memory
POST   /api/v1/agents/agi_.../resume    # reschedule the heartbeat
DELETE /api/v1/agents/agi_...           # terminate — no further wakes`}</CodeBlock>
      </Section>

      <Section id="cost" n="06" title="What it costs">
        <P>
          Two things are metered, both in integer minor units on the append-only ledger: a small{" "}
          <strong className="font-medium text-neutral-800">standby fee</strong> for every hour the agent
          stays on call (charged exactly once per hour), and each{" "}
          <strong className="font-medium text-neutral-800">wake</strong>, capped by{" "}
          <C>budgetMinorPerWake</C> as a hard ceiling. If the org runs out of funds the agent suspends
          itself; top up and it resumes with the heartbeat rescheduled. See <C>/docs/billing</C>.
        </P>
      </Section>

      <Section id="events" n="07" title="Events">
        <P>
          A successful wake fans out an <C>agent.replied</C> webhook to every enabled endpoint; a failed
          wake fans out <C>agent.wake_failed</C>. Both are signed and delivered at-least-once — see{" "}
          <C>/docs/webhooks</C>.
        </P>
        <CodeBlock label="event">{`{ "type": "agent.replied",
  "organizationId": "org_…",
  "data": { "agentInstanceId": "agi_…", "messageId": "agm_…", "jobId": "job_…" } }`}</CodeBlock>
      </Section>
    </DocsShell>
  );
}
