import { headers } from "next/headers";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { logAdminAction } from "@/modules/admin/authz";
import { currentPlatformAdmin } from "@/modules/admin/current";
import { listAdminAuditLog } from "@/modules/admin/service";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string; page?: string }>;
}) {
  const admin = await currentPlatformAdmin();
  const { organizationId, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const result = await listAdminAuditLog({ targetOrganizationId: organizationId, page, pageSize: 50 });

  const headerList = await headers();
  await logAdminAction(admin, {
    action: "admin.audit_log.read",
    resourceType: "admin_audit_log",
    requestId: requestIdFrom(headerList),
    ip: clientIpFrom(headerList),
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Append-only record of every platform-admin action — reads included. {result.total.toLocaleString()} entries.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Resource</th>
                <th className="px-4 py-2.5 font-medium">Org</th>
                <th className="px-4 py-2.5 font-medium">Reason</th>
                <th className="px-4 py-2.5 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{e.actorEmail}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{e.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {e.resourceType}
                    {e.resourceId && <span className="ml-1 font-mono">{e.resourceId.slice(0, 18)}…</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {e.targetOrganizationId ? (
                      <Link href={`/admin/organizations/${e.targetOrganizationId}`} className="font-mono hover:underline">
                        {e.targetOrganizationId.slice(0, 12)}…
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-muted-foreground" title={e.reason ?? undefined}>
                    {e.reason ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{e.ip ?? "—"}</td>
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/audit-log?page=${page - 1}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/admin/audit-log?page=${page + 1}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
