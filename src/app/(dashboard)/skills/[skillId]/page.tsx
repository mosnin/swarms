import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { VersionManager } from "@/app/(dashboard)/skills/[skillId]/_components/version-manager";
import { format } from "@/lib/money";
import { isAppError } from "@/lib/errors";
import { tryCurrentContext } from "@/modules/identity/current";
import { can } from "@/modules/identity/access-control";
import { getSkill } from "@/modules/catalog/skill-service";

export const dynamic = "force-dynamic";

export default async function SkillDetailPage({
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
  const owned = skill.organizationId === ctx.organizationId;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/skills" className="hover:underline">
              Skills
            </Link>{" "}
            / {skill.slug}
          </p>
          <h1 className="text-2xl font-bold">{skill.name}</h1>
          {skill.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{skill.description}</p>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Meta label="Visibility" value={skill.visibility} />
        <Meta label="Risk" value={skill.riskLevel} />
        <Meta
          label="Default price"
          value={format({ amountMinor: skill.defaultPriceMinor, currency: skill.priceCurrency })}
        />
        <Meta label="Versions" value={String(versions.length)} />
      </dl>

      {skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {skill.tags.map((tag) => (
            <span key={tag} className="rounded bg-muted px-2 py-1 text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Versions</h2>
        <VersionManager
          skillId={skill.id}
          canWrite={owned && can(ctx, "skills.create")}
          canPublish={owned && can(ctx, "skills.publish")}
          initialVersions={versions.map((v) => ({
            id: v.id,
            version: v.version,
            status: v.status,
            runnerType: v.runnerType,
            checksum: v.checksum,
          }))}
        />
      </section>
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
