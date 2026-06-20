import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { tryCurrentContext } from "@/modules/identity/current";
import { listMembers } from "@/modules/identity/service";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const members = await listMembers(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Members</h1>
        <p className="text-sm text-muted-foreground">People with access to this organization.</p>
      </header>

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.membershipId} className="border-b last:border-0">
                <td className="p-3">{member.name ?? "—"}</td>
                <td className="p-3">{member.email}</td>
                <td className="p-3 font-mono text-xs">{member.role}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {member.joinedAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
