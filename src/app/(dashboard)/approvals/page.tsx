import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { ApprovalsList } from "@/app/(dashboard)/approvals/_components/approvals-list";
import { tryCurrentContext } from "@/modules/identity/current";
import { listPendingApprovals } from "@/modules/governance/governance-reads";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const pending = await listPendingApprovals(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Jobs held by a <code>require_approval</code> policy. Approving enqueues them.
        </p>
      </header>
      <ApprovalsList
        initial={pending.map((p) => ({
          id: p.id,
          skillVersionId: p.skillVersionId,
          costMinor: p.costMinor,
          costCurrency: p.costCurrency,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
