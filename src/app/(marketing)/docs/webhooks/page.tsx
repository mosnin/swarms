import type { Metadata } from "next";

import { CodeBlock } from "@/app/(marketing)/docs/_components/code-block";
import { DocsShell, nextAfter } from "@/app/(marketing)/docs/_components/docs-shell";
import { C, P, Section } from "@/app/(marketing)/docs/_components/section";

export const metadata: Metadata = { title: "Webhooks — Swarms Docs" };

const TOC = [
  { id: "register", label: "Register an endpoint" },
  { id: "events", label: "Event types" },
  { id: "payload", label: "The payload" },
  { id: "verify", label: "Verify the signature" },
  { id: "delivery", label: "Delivery guarantees" },
];

export default function WebhooksDocsPage() {
  return (
    <DocsShell
      eyebrow="Webhooks"
      title={
        <>
          Signed events, <span className="font-semibold">pushed to you.</span>
        </>
      }
      lede="Lifecycle events are written to a durable outbox and delivered out-of-band with an HMAC signature and bounded, exponential-backoff retries — at-least-once, and never blocking the run that produced them."
      toc={TOC}
      next={nextAfter("/docs/webhooks")}
    >
      <Section id="register" n="01" title="Register an endpoint">
        <P>
          Add an endpoint URL for your org and every event fans out to it, in addition to any per-request{" "}
          <C>callbackUrl</C>. Endpoints can be disabled without deleting them.
        </P>
        <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/webhooks \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -d '{ "url": "https://your.app/hooks/swarms" }'`}</CodeBlock>
      </Section>

      <Section id="events" n="02" title="Event types">
        <P>Jobs, swarms, and hosted agents each emit terminal-state events.</P>
        <CodeBlock label="events">{`job.succeeded      job.failed
swarm.succeeded    swarm.failed
agent.replied      agent.wake_failed`}</CodeBlock>
      </Section>

      <Section id="payload" n="03" title="The payload">
        <P>
          The body is canonical JSON — keys sorted recursively — so the signed bytes are independent of
          property order (the payload is persisted as Postgres <C>jsonb</C>, which does not preserve order).
          The event type also arrives in the <C>x-swarms-event</C> header.
        </P>
        <CodeBlock label="body">{`{
  "type": "job.succeeded",
  "jobId": "job_…",
  "organizationId": "org_…",
  "occurredAt": "2026-07-24T12:00:00.000Z",
  "data": { "status": "succeeded", "costMinor": 42, "currency": "USD" }
}`}</CodeBlock>
      </Section>

      <Section id="verify" n="04" title="Verify the signature">
        <P>
          Each delivery carries <C>x-swarms-signature</C>: the hex HMAC-SHA256 of the exact request body,
          keyed by your signing secret. Recompute it over the raw bytes and compare in constant time before
          trusting the event. Reject on mismatch.
        </P>
        <CodeBlock label="node">{`import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody, signature, secret) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}`}</CodeBlock>
      </Section>

      <Section id="delivery" n="05" title="Delivery guarantees">
        <P>
          Delivery is at-least-once: a non-2xx response is retried with exponential backoff, and rows are
          claimed with <C>FOR UPDATE SKIP LOCKED</C> so concurrent workers never deliver the same webhook
          twice. Make your handler idempotent on <C>jobId</C> / event identity, and return <C>2xx</C>{" "}
          quickly.
        </P>
      </Section>
    </DocsShell>
  );
}
