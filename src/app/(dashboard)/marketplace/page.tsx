import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listMarketplaceSkills } from "@/modules/marketplace/reads";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const skills = await listMarketplaceSkills(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          Public skills any organization can execute. Paid skills split revenue to the creator.
        </p>
      </header>

      {skills.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          No public skills yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((s) => (
            <Link
              key={s.id}
              href={`/marketplace/${s.id}`}
              className="rounded-lg border p-4 hover:bg-muted/40"
            >
              <h2 className="font-semibold">{s.name}</h2>
              <p className="font-mono text-xs text-muted-foreground">{s.slug}</p>
              {s.description && <p className="mt-2 line-clamp-2 text-sm">{s.description}</p>}
              <p className="mt-2 text-xs">
                {format({ amountMinor: s.defaultPriceMinor, currency: s.priceCurrency })} · risk{" "}
                {s.riskLevel}
                {s.organizationId === ctx.organizationId ? " · yours" : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
