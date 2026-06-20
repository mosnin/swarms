import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { creatorRevenueSummary } from "@/modules/marketplace/reads";

export const dynamic = "force-dynamic";

export default async function CreatorRevenuePage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const summary = await creatorRevenueSummary(ctx);
  const cur = summary.currency;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Creator revenue</h1>
        <p className="text-sm text-muted-foreground">
          Earnings from other organizations executing your public skills.
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Meta label="Gross" value={format({ amountMinor: summary.grossMinor, currency: cur })} />
        <Meta label="Platform fee" value={format({ amountMinor: summary.platformFeeMinor, currency: cur })} />
        <Meta label="Net" value={format({ amountMinor: summary.netMinor, currency: cur })} />
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Revenue ledger</h2>
        <div className="rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Direction</th>
                <th className="p-3 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {summary.entries.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                    No revenue yet.
                  </td>
                </tr>
              )}
              {summary.entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="p-3 text-xs">{e.createdAt.toLocaleString()}</td>
                  <td className="p-3 text-xs">{e.refType}</td>
                  <td className="p-3 text-xs">{e.direction}</td>
                  <td className="p-3 font-mono text-xs">
                    {format({ amountMinor: e.amountMinor, currency: e.currency })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
