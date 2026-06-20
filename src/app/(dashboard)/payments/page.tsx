import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
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
      <header>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">x402 payment receipts bound to jobs.</p>
      </header>

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Receipt</th>
              <th className="p-3 font-medium">Amount</th>
              <th className="p-3 font-medium">Job</th>
              <th className="p-3 font-medium">Settlement ref</th>
              <th className="p-3 font-medium">Issued</th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No payments yet.
                </td>
              </tr>
            )}
            {receipts.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{r.id}</td>
                <td className="p-3 text-xs">{format({ amountMinor: r.amountMinor, currency: r.currency })}</td>
                <td className="p-3 font-mono text-xs">
                  {r.jobId ? (
                    <Link href={`/jobs/${r.jobId}`} className="hover:underline">
                      {r.jobId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{r.txRef.slice(0, 16)}…</td>
                <td className="p-3 text-xs">{r.issuedAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
