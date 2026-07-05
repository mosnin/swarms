import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listJobs } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const jobs = await listJobs(ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent runs"
        description="Sandboxed worker agents spawned by your agents and members."
      />

      <DataTable>
        <THead>
          <TR>
            <TH>Job</TH>
            <TH>Kind</TH>
            <TH>Status</TH>
            <TH>Cost</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <tbody>
          {jobs.length === 0 && <EmptyRow colSpan={5}>No jobs yet.</EmptyRow>}
          {jobs.map((j) => (
            <TR key={j.id}>
              <TD className="font-mono text-xs">
                <Link href={`/jobs/${j.id}`} className="hover:underline">
                  {j.id}
                </Link>
              </TD>
              <TD className="text-xs text-muted-foreground">{j.capabilityKind}</TD>
              <TD>
                <StatusPill status={j.status} />
              </TD>
              <TD className="text-xs tabular-nums">
                {format({ amountMinor: j.costMinor, currency: j.costCurrency })}
              </TD>
              <TD className="text-xs text-muted-foreground">{j.createdAt.toLocaleString()}</TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
