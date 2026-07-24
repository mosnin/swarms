import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { ApprovalsList } from "@/app/(dashboard)/approvals/_components/approvals-list";
import { PageHeader } from "@/components/ui/page-header";
import { tryCurrentContext } from "@/modules/identity/current";
import { listPendingApprovals } from "@/modules/governance/governance-reads";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const pending = await listPendingApprovals(ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description={
          <>
            Jobs held by a <code>require_approval</code> policy. Approving enqueues them.
          </>
        }
      />
      <ApprovalsList
        initial={pending.map((p) => ({
          id: p.id,
          costMinor: p.costMinor,
          costCurrency: p.costCurrency,
          capabilityKind: p.capabilityKind,
          task: p.task,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
