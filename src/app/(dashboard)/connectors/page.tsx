import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { tryCurrentContext } from "@/modules/identity/current";
import { listConnectorCatalog } from "@/modules/connectors/connector-service";

export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const connectors = listConnectorCatalog(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Connectors</h1>
        <p className="text-sm text-muted-foreground">
          MCP-compatible tools jobs can call with explicit, scoped grants.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {connectors.map((c) => (
          <Link
            key={c.slug}
            href={`/connectors/${c.slug}`}
            className="rounded-lg border p-4 hover:bg-muted/40"
          >
            <h2 className="font-semibold">{c.name}</h2>
            <p className="font-mono text-xs text-muted-foreground">{c.slug}</p>
            <p className="mt-2 text-xs">
              {c.tools.length} tool{c.tools.length === 1 ? "" : "s"} · risk {c.riskLevel}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
