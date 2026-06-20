import Link from "next/link";
import { notFound } from "next/navigation";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { format } from "@/lib/money";
import { isAppError } from "@/lib/errors";
import { tryCurrentContext } from "@/modules/identity/current";
import { getSkill } from "@/modules/catalog/skill-service";

export const dynamic = "force-dynamic";

export default async function VersionDetailPage({
  params,
}: {
  params: Promise<{ skillId: string; versionId: string }>;
}) {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const { skillId, versionId } = await params;
  const detail = await getSkill(ctx, skillId).catch((err) => {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const version = detail.versions.find((v) => v.id === versionId);
  if (!version) notFound();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/skills" className="hover:underline">
            Skills
          </Link>{" "}
          /{" "}
          <Link href={`/skills/${skillId}`} className="hover:underline">
            {detail.skill.slug}
          </Link>{" "}
          / {version.version}
        </p>
        <h1 className="text-2xl font-bold">
          {detail.skill.name}{" "}
          <span className="font-mono text-lg text-muted-foreground">v{version.version}</span>
        </h1>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Meta label="Status" value={version.status} />
        <Meta label="Runner" value={version.runnerType} />
        <Meta
          label="Price"
          value={format({ amountMinor: version.priceMinor, currency: version.priceCurrency })}
        />
        <Meta
          label="Published"
          value={version.publishedAt ? new Date(version.publishedAt).toLocaleString() : "—"}
        />
      </dl>

      <Meta label="Checksum" value={version.checksum} mono />

      <Json label="Manifest" value={version.manifest} />
      <Json label="Input schema" value={version.inputSchema} />
      <Json label="Output schema" value={version.outputSchema} />
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm font-medium ${mono ? "break-all font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-4 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
