import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { ApiKeysManager } from "@/app/(dashboard)/settings/api-keys/_components/api-keys-manager";
import { can } from "@/modules/identity/access-control";
import { tryCurrentContext } from "@/modules/identity/current";
import { listApiKeys } from "@/modules/identity/service";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  if (!can(ctx, "api_keys.manage")) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          You do not have permission to manage API keys.
        </p>
      </div>
    );
  }

  const keys = await listApiKeys(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Agent access tokens. Keys are shown once at creation and stored only as a hash.
        </p>
      </header>
      <ApiKeysManager
        initialKeys={keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          scopes: key.scopes,
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          revokedAt: key.revokedAt?.toISOString() ?? null,
          createdAt: key.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
