import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { NewSkillForm } from "@/app/(dashboard)/skills/new/_components/new-skill-form";
import { tryCurrentContext } from "@/modules/identity/current";
import { can } from "@/modules/identity/access-control";

export const dynamic = "force-dynamic";

export default async function NewSkillPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  if (!can(ctx, "skills.create")) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">New skill</h1>
        <p className="text-sm text-destructive">
          Your role does not have the <code>skills.create</code> permission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">New skill</h1>
        <p className="text-sm text-muted-foreground">
          Create the skill, then add and publish an immutable version.
        </p>
      </header>
      <NewSkillForm />
    </div>
  );
}
