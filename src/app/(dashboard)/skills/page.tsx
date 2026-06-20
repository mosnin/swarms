import Link from "next/link";

import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/money";
import { tryCurrentContext } from "@/modules/identity/current";
import { listSkills } from "@/modules/catalog/skill-service";

export const dynamic = "force-dynamic";

const VISIBILITY_STYLES: Record<string, string> = {
  public: "bg-green-100 text-green-800",
  unlisted: "bg-yellow-100 text-yellow-800",
  private: "bg-muted text-muted-foreground",
};

export default async function SkillsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const skills = await listSkills(ctx);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Skills</h1>
          <p className="text-sm text-muted-foreground">
            Capability packages your agents can discover and execute.
          </p>
        </div>
        <Link href="/skills/new">
          <Button>New skill</Button>
        </Link>
      </header>

      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Slug</th>
              <th className="p-3 font-medium">Visibility</th>
              <th className="p-3 font-medium">Risk</th>
              <th className="p-3 font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {skills.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No skills yet. Create your first capability to get started.
                </td>
              </tr>
            )}
            {skills.map((skill) => (
              <tr key={skill.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="p-3">
                  <Link href={`/skills/${skill.id}`} className="font-medium hover:underline">
                    {skill.name}
                  </Link>
                </td>
                <td className="p-3 font-mono text-xs">{skill.slug}</td>
                <td className="p-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      VISIBILITY_STYLES[skill.visibility] ?? "bg-muted"
                    }`}
                  >
                    {skill.visibility}
                  </span>
                </td>
                <td className="p-3 text-xs">{skill.riskLevel}</td>
                <td className="p-3 text-xs">
                  {format({ amountMinor: skill.defaultPriceMinor, currency: skill.priceCurrency })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
