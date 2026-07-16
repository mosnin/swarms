import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { redact } from "@/lib/redaction";
import { tryCurrentContext } from "@/modules/identity/current";
import { listAuditEvents } from "@/modules/governance/audit";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; resourceType?: string }>;
}) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const filter = await searchParams;
  const events = await listAuditEvents(ctx, {
    action: filter.action,
    resourceType: filter.resourceType,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Append-only record of every significant action. Secrets are redacted."
      />

      <form className="flex flex-wrap gap-2 text-sm" action="/audit">
        <input
          name="action"
          defaultValue={filter.action ?? ""}
          placeholder="action (e.g. job.created)"
          className="rounded-md border px-3 py-2"
        />
        <input
          name="resourceType"
          defaultValue={filter.resourceType ?? ""}
          placeholder="resource type (e.g. job)"
          className="rounded-md border px-3 py-2"
        />
        <button className="rounded-md border px-3 py-2 hover:bg-muted" type="submit">
          Filter
        </button>
        {(filter.action || filter.resourceType) && (
          <Link href="/audit" className="px-3 py-2 text-muted-foreground hover:underline">
            Clear
          </Link>
        )}
      </form>

      <DataTable>
        <THead>
          <TR>
            <TH>Time</TH>
            <TH>Action</TH>
            <TH>Resource</TH>
            <TH>Actor</TH>
            <TH>Detail</TH>
          </TR>
        </THead>
        <tbody>
          {events.length === 0 && <EmptyRow colSpan={5}>No audit events match.</EmptyRow>}
          {events.map((e) => (
            <TR key={e.id}>
              <TD className="text-xs align-top">{e.createdAt.toLocaleString()}</TD>
              <TD className="font-mono text-xs align-top">{e.action}</TD>
              <TD className="text-xs align-top">
                {e.resourceType}
                {e.resourceId ? <span className="text-muted-foreground"> · {e.resourceId}</span> : null}
              </TD>
              <TD className="font-mono text-xs align-top text-muted-foreground">
                {e.actorUserId ?? e.actorApiKeyId ?? "system"}
              </TD>
              <TD className="font-mono text-xs align-top text-muted-foreground">
                {e.after ? JSON.stringify(redact(e.after)) : "—"}
              </TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
