import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
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
      <header>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only record of every significant action. Secrets are redacted.
        </p>
      </header>

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

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Time</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Resource</th>
              <th className="p-3 font-medium">Actor</th>
              <th className="p-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No audit events match.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-b last:border-0 align-top">
                <td className="p-3 text-xs">{e.createdAt.toLocaleString()}</td>
                <td className="p-3 font-mono text-xs">{e.action}</td>
                <td className="p-3 text-xs">
                  {e.resourceType}
                  {e.resourceId ? <span className="text-muted-foreground"> · {e.resourceId}</span> : null}
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {e.actorUserId ?? e.actorApiKeyId ?? "system"}
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {e.after ? JSON.stringify(redact(e.after)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
