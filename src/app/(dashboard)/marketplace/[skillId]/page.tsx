import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { isAppError } from "@/lib/errors";
import { tryCurrentContext } from "@/modules/identity/current";
import { getSkill } from "@/modules/catalog/skill-service";

export const dynamic = "force-dynamic";

export default async function MarketplaceSkillPage({
  params,
}: {
  params: Promise<{ skillId: string }>;
}) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { skillId } = await params;
  const detail = await getSkill(ctx, skillId).catch((err) => {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const { skill, versions } = detail;
  const published = versions.filter((v) => v.status === "published");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/marketplace" className="hover:underline">
            Marketplace
          </Link>{" "}
          / {skill.slug}
        </p>
        <h1 className="text-2xl font-bold">{skill.name}</h1>
        {skill.description && <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Meta label="Price" value={format({ amountMinor: skill.defaultPriceMinor, currency: skill.priceCurrency })} />
        <Meta label="Risk" value={skill.riskLevel} />
        <Meta label="Published versions" value={String(published.length)} />
        <Meta label="Visibility" value={skill.visibility} />
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Required permissions</h2>
        <div className="flex flex-wrap gap-2">
          {skill.requiredPermissions.length === 0 ? (
            <span className="text-sm text-muted-foreground">None declared.</span>
          ) : (
            skill.requiredPermissions.map((p) => (
              <span key={p} className="rounded bg-muted px-2 py-1 font-mono text-xs">
                {p}
              </span>
            ))
          )}
        </div>
      </section>

      <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        To execute: call <code>POST /api/v1/execute-paid</code> with{" "}
        <code>skillSlug: &quot;{skill.slug}&quot;</code> and a valid x402 payment.
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
