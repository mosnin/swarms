import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { Id } from "@/components/ui/id";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listEvaluations } from "@/modules/evaluations/evaluation-service";

export const dynamic = "force-dynamic";

export default async function EvaluationsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const evaluations = await listEvaluations(ctx, { limit: 50 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluations"
        description="LLM-as-judge quality scores for runs and content, against weighted rubrics."
      />

      <DataTable>
        <THead>
          <TR>
            <TH>Evaluation</TH>
            <TH>Subject</TH>
            <TH>Status</TH>
            <TH>Score</TH>
            <TH>Passed</TH>
            <TH>Cost</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <tbody>
          {evaluations.length === 0 && (
            <EmptyRow colSpan={7}>
              No evaluations yet. Score a run against a rubric —{" "}
              <Link href="/docs" className="underline hover:text-foreground">
                see the docs
              </Link>{" "}
              to run your first one.
            </EmptyRow>
          )}
          {evaluations.map((e) => (
            <TR key={e.id}>
              <TD className="text-xs">
                <Id value={e.id} />
              </TD>
              <TD className="text-xs">
                {e.subjectType}
                {e.subjectId ? <Id value={e.subjectId} className="ml-1 text-muted-foreground" /> : null}
              </TD>
              <TD>
                <StatusPill status={e.status} />
              </TD>
              <TD className="text-xs tabular-nums">{e.overallScore !== null ? `${e.overallScore}/100` : "—"}</TD>
              <TD className="text-xs">
                {e.passed === null ? "—" : e.passed ? (
                  <span className="text-emerald-600 dark:text-emerald-400">pass</span>
                ) : (
                  <span className="text-red-500">fail</span>
                )}
              </TD>
              <TD className="text-xs tabular-nums">
                {format({ amountMinor: e.costMinor, currency: e.costCurrency })}
              </TD>
              <TD className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
