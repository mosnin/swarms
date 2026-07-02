import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { SpawnForm } from "@/app/(dashboard)/spawn/_components/spawn-form";
import { tryCurrentContext } from "@/modules/identity/current";

export const dynamic = "force-dynamic";

export default async function SpawnPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Spawn an agent</h1>
        <p className="text-sm text-muted-foreground">
          Hand a worker agent a task and your resources. It runs in a sandbox on rented GPU, can&apos;t
          overspend, and hands you the result.
        </p>
      </header>
      <SpawnForm />
    </div>
  );
}
