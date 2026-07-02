import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listBudgets } from "@/modules/governance/governance-reads";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const budgets = await listBudgets(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Budgets</h1>
        <p className="text-sm text-muted-foreground">
          Hard-stop budgets block execution once their limit is reached.
        </p>
      </header>

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Period</th>
              <th className="p-3 font-medium">Limit</th>
              <th className="p-3 font-medium">Spent (cached)</th>
              <th className="p-3 font-medium">Hard stop</th>
            </tr>
          </thead>
          <tbody>
            {budgets.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No budgets configured.
                </td>
              </tr>
            )}
            {budgets.map((b) => (
              <tr key={b.id} className="border-b last:border-0">
                <td className="p-3">{b.name}</td>
                <td className="p-3 text-xs">{b.period}</td>
                <td className="p-3">{format({ amountMinor: b.limitMinor, currency: b.currency })}</td>
                <td className="p-3">{format({ amountMinor: b.spentMinor, currency: b.currency })}</td>
                <td className="p-3 text-xs">{b.hardStop ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
