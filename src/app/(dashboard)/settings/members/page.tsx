import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { tryCurrentContext } from "@/modules/identity/current";
import { listMembers } from "@/modules/identity/service";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const members = await listMembers(ctx);

  return (
    <div className="space-y-6">
      <PageHeader title="Members" description="People with access to this organization." />

      <DataTable>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Joined</TH>
          </TR>
        </THead>
        <tbody>
          {members.length === 0 && <EmptyRow colSpan={4}>No members yet.</EmptyRow>}
          {members.map((member) => (
            <TR key={member.membershipId}>
              <TD>{member.name ?? "—"}</TD>
              <TD>{member.email}</TD>
              <TD className="font-mono text-xs">{member.role}</TD>
              <TD className="text-xs text-muted-foreground">
                {member.joinedAt.toLocaleDateString()}
              </TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
