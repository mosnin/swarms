import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { tryCurrentContext } from "@/modules/identity/current";
import { listConnectorCatalog } from "@/modules/connectors/connector-service";

export const dynamic = "force-dynamic";

export default async function ConnectorDetailPage({
  params,
}: {
  params: Promise<{ connectorId: string }>;
}) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { connectorId } = await params;
  const connector = listConnectorCatalog(ctx).find((c) => c.slug === connectorId);
  if (!connector) notFound();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/connectors" className="hover:underline">
            Connectors
          </Link>{" "}
          / {connector.slug}
        </p>
        <h1 className="text-2xl font-bold">{connector.name}</h1>
      </header>

      <div className="space-y-3">
        {connector.tools.map((tool) => (
          <div key={tool.toolName} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold">{tool.toolName}</h2>
              <div className="flex gap-2 text-xs">
                <span className="rounded bg-muted px-2 py-0.5">{tool.operationType}</span>
                <span className="rounded bg-muted px-2 py-0.5">risk {tool.riskLevel}</span>
                {tool.externalWrite && (
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                    external write
                  </span>
                )}
                {tool.requiresApproval && (
                  <span className="rounded bg-red-500/10 px-2 py-0.5 font-medium text-red-700 dark:text-red-400">
                    approval
                  </span>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
