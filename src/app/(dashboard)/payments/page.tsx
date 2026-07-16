import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { Id } from "@/components/ui/id";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listPayments } from "@/modules/dashboard/reads";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const receipts = await listPayments(ctx);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="x402 payment receipts bound to jobs." />

      <DataTable>
        <THead>
          <TR>
            <TH>Receipt</TH>
            <TH>Amount</TH>
            <TH>Job</TH>
            <TH>Settlement ref</TH>
            <TH>Issued</TH>
          </TR>
        </THead>
        <tbody>
          {receipts.length === 0 && <EmptyRow colSpan={5}>No payments yet.</EmptyRow>}
          {receipts.map((r) => (
            <TR key={r.id}>
              <TD className="text-xs">
                <Id value={r.id} />
              </TD>
              <TD className="text-xs tabular-nums">{format({ amountMinor: r.amountMinor, currency: r.currency })}</TD>
              <TD className="text-xs">
                {r.jobId ? <Id value={r.jobId} href={`/jobs/${r.jobId}`} /> : "—"}
              </TD>
              <TD className="text-xs text-muted-foreground">
                <Id value={r.txRef} />
              </TD>
              <TD className="text-xs">{r.issuedAt.toLocaleString()}</TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
