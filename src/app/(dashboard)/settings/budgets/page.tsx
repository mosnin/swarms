import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
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
      <PageHeader
        title="Budgets"
        description="Hard-stop budgets block execution once their limit is reached."
      />

      <DataTable>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Period</TH>
            <TH>Limit</TH>
            <TH>Spent (cached)</TH>
            <TH>Hard stop</TH>
          </TR>
        </THead>
        <tbody>
          {budgets.length === 0 && <EmptyRow colSpan={5}>No budgets configured.</EmptyRow>}
          {budgets.map((b) => (
            <TR key={b.id}>
              <TD>{b.name}</TD>
              <TD className="text-xs">{b.period}</TD>
              <TD className="tabular-nums">{format({ amountMinor: b.limitMinor, currency: b.currency })}</TD>
              <TD className="tabular-nums">{format({ amountMinor: b.spentMinor, currency: b.currency })}</TD>
              <TD className="text-xs">{b.hardStop ? "yes" : "no"}</TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
