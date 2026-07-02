import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { tryCurrentContext } from "@/modules/identity/current";
import { listPolicies } from "@/modules/governance/governance-reads";

export const dynamic = "force-dynamic";

const EFFECT_STYLES: Record<string, string> = {
  allow: "bg-green-100 text-green-800",
  deny: "bg-red-100 text-red-800",
  require_approval: "bg-yellow-100 text-yellow-800",
};

export default async function PoliciesPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const policies = await listPolicies(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Policies</h1>
        <p className="text-sm text-muted-foreground">
          Rules evaluated before each execution. Highest priority match wins.
        </p>
      </header>

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Effect</th>
              <th className="p-3 font-medium">Priority</th>
              <th className="p-3 font-medium">Enabled</th>
              <th className="p-3 font-medium">Conditions</th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No policy rules. Execution defaults to allow.
                </td>
              </tr>
            )}
            {policies.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-3">{p.name}</td>
                <td className="p-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${EFFECT_STYLES[p.effect] ?? "bg-muted"}`}
                  >
                    {p.effect}
                  </span>
                </td>
                <td className="p-3 text-xs">{p.priority}</td>
                <td className="p-3 text-xs">{p.enabled ? "yes" : "no"}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {JSON.stringify(p.conditions ?? {})}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
