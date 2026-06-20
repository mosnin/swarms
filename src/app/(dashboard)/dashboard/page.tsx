import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { tryCurrentContext } from "@/modules/identity/current";
import { getOrganization } from "@/modules/identity/service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const org = await getOrganization(ctx);
  const role = ctx.actor.role;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {org.name} <span className="text-muted-foreground/60">({org.slug})</span>
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Principal</dt>
          <dd className="mt-1 font-mono text-sm">{ctx.actor.kind}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Role</dt>
          <dd className="mt-1 font-mono text-sm">{role}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Permissions</dt>
          <dd className="mt-1 text-sm">{ctx.permissions.size}</dd>
        </div>
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Granted permissions</h2>
        <div className="flex flex-wrap gap-2">
          {[...ctx.permissions].sort().map((permission) => (
            <span key={permission} className="rounded bg-muted px-2 py-1 font-mono text-xs">
              {permission}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
