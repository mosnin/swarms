import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { SpawnForm } from "@/app/(dashboard)/spawn/_components/spawn-form";
import { PageHeader } from "@/components/ui/page-header";
import { tryCurrentContext } from "@/modules/identity/current";

export const dynamic = "force-dynamic";

export default async function SpawnPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spawn an agent"
        description="Hand a worker agent a task and your resources. It runs in a sandbox on rented GPU, can't overspend, and hands you the result."
      />
      <SpawnForm />
    </div>
  );
}
