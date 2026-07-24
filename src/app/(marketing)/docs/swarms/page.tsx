import type { Metadata } from "next";

import { CodeBlock } from "@/app/(marketing)/docs/_components/code-block";
import { DocsShell, nextAfter } from "@/app/(marketing)/docs/_components/docs-shell";
import { C, P, Section } from "@/app/(marketing)/docs/_components/section";

export const metadata: Metadata = { title: "Swarms — Swarms Docs" };

const TOC = [
  { id: "parallel", label: "Parallel fan-out" },
  { id: "dag", label: "Pipelines & DAGs" },
  { id: "aggregate", label: "Aggregation" },
  { id: "budget", label: "One aggregate budget" },
  { id: "read", label: "Read the run" },
  { id: "replay", label: "Replay" },
];

export default function SwarmsDocsPage() {
  return (
    <DocsShell
      eyebrow="Swarms"
      title={
        <>
          One job, <span className="font-semibold">a whole workforce.</span>
        </>
      }
      lede="A swarm spawns one sandboxed worker per task — in parallel, as a sequential pipeline, or as a DAG of named steps with dependencies — all bounded by a single aggregate budget that acts as a hard ceiling."
      toc={TOC}
      next={nextAfter("/docs/swarms")}
    >
      <Section id="parallel" n="01" title="Parallel fan-out">
        <P>The simplest swarm: a list of tasks, each handled by its own worker, concurrently.</P>
        <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/swarms \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tasks": ["Summarize Q1", "Summarize Q2", "Summarize Q3"],
    "objective": "Quarterly rollup",
    "budgetMinor": 300
  }'

# → 202 { "swarmRunId": "swr_…", "status": "queued", "workerCount": 3 }`}</CodeBlock>
      </Section>

      <Section id="dag" n="02" title="Pipelines & DAGs">
        <P>
          Give steps <C>id</C>s and <C>dependsOn</C> edges and the director runs them in dependency order,
          passing upstream output downstream. A linear list of dependencies is just a pipeline.
        </P>
        <CodeBlock label="json">{`{
  "steps": [
    { "id": "research", "task": "Gather sources on X" },
    { "id": "draft",    "task": "Write a brief",     "dependsOn": ["research"] },
    { "id": "check",    "task": "Fact-check it",     "dependsOn": ["draft"] }
  ],
  "budgetMinor": 500
}`}</CodeBlock>
      </Section>

      <Section id="aggregate" n="03" title="Aggregation">
        <P>
          Add an <C>aggregatorTask</C> and one final worker merges the output of every branch into a
          single result — the whole tree collapses to one answer, one cost line.
        </P>
      </Section>

      <Section id="budget" n="04" title="One aggregate budget">
        <P>
          <C>budgetMinor</C> is a hard ceiling across the entire swarm, not per worker. Workers draw from
          it as they run; when the reservation is exhausted, no further worker is charged. Money is integer
          minor units end to end — see <C>/docs/billing</C>.
        </P>
      </Section>

      <Section id="read" n="05" title="Read the run">
        <P>Poll the run for a snapshot of every worker plus the merged output and a full cost breakdown.</P>
        <CodeBlock label="reference">{`GET  /api/v1/swarms/swr_…            # workers[], merged output, costMinor
POST /api/v1/swarms/swr_…/cancel     # stop in-flight workers`}</CodeBlock>
      </Section>

      <Section id="replay" n="06" title="Replay">
        <P>
          Re-run a past swarm with optional overrides — a new objective, model, or budget — without
          rebuilding the request. The replay records the run it descended from.
        </P>
        <CodeBlock label="curl">{`curl https://api.swarms.dev/api/v1/swarms/swr_.../replay \\
  -H "Authorization: Bearer $SWARMS_KEY" \\
  -d '{ "budgetMinor": 400 }'

# → { "swarmRunId": "swr_new", "replayedFrom": "swr_old", … }`}</CodeBlock>
      </Section>
    </DocsShell>
  );
}
