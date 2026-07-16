import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { tryCurrentContext } from "@/modules/identity/current";
import { listPolicies } from "@/modules/governance/governance-reads";

export const dynamic = "force-dynamic";

/** Dark-aware effect badges (same tone recipe as StatusPill). */
const EFFECT_STYLES: Record<string, string> = {
  allow: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  deny: "bg-red-500/10 text-red-700 dark:text-red-400",
  require_approval: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export default async function PoliciesPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const policies = await listPolicies(ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        description="Rules evaluated before each execution. Highest priority match wins."
      />

      <DataTable>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Effect</TH>
            <TH>Priority</TH>
            <TH>Enabled</TH>
            <TH>Conditions</TH>
          </TR>
        </THead>
        <tbody>
          {policies.length === 0 && (
            <EmptyRow colSpan={5}>No policy rules. Execution defaults to allow.</EmptyRow>
          )}
          {policies.map((p) => (
            <TR key={p.id}>
              <TD>{p.name}</TD>
              <TD>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${EFFECT_STYLES[p.effect] ?? "bg-muted text-muted-foreground"}`}
                >
                  {p.effect}
                </span>
              </TD>
              <TD className="text-xs">{p.priority}</TD>
              <TD className="text-xs">{p.enabled ? "yes" : "no"}</TD>
              <TD className="font-mono text-xs text-muted-foreground">
                {JSON.stringify(p.conditions ?? {})}
              </TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
