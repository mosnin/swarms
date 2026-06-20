"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export interface VersionItem {
  id: string;
  version: string;
  status: string;
  runnerType: string;
  checksum: string;
}

const SAMPLE_MANIFEST = `{
  "name": "My Skill",
  "version": "1.0.0",
  "description": "What this skill does",
  "inputSchema": { "type": "object", "properties": { "input": { "type": "string" } } },
  "outputSchema": { "type": "object", "properties": { "output": { "type": "string" } } },
  "permissions": ["skills.execute"],
  "riskLevel": "low",
  "estimatedCostMinor": 100,
  "estimatedDurationMs": 1000,
  "maxRuntimeMs": 30000,
  "supportsParallelism": false
}`;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-green-100 text-green-800",
  deprecated: "bg-yellow-100 text-yellow-800",
  yanked: "bg-red-100 text-red-800",
};

export function VersionManager({
  skillId,
  canWrite,
  canPublish,
  initialVersions,
}: {
  skillId: string;
  canWrite: boolean;
  canPublish: boolean;
  initialVersions: VersionItem[];
}) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [manifest, setManifest] = useState(SAMPLE_MANIFEST);
  const [runnerType, setRunnerType] = useState("mock");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createVersion() {
    setBusy(true);
    setError(null);
    try {
      let parsedManifest: unknown;
      try {
        parsedManifest = JSON.parse(manifest);
      } catch {
        throw new Error("Manifest is not valid JSON");
      }
      const res = await fetch(`/api/skills/${skillId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest: parsedManifest, runnerType }),
      });
      const body = await res.json();
      if (!res.ok) {
        const issues = body?.error?.details?.issues as string[] | undefined;
        throw new Error(issues?.join("; ") ?? body?.error?.message ?? "Failed to create version");
      }
      setVersions((prev) => [body.data.version, ...prev]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create version");
    } finally {
      setBusy(false);
    }
  }

  async function publish(versionId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}/versions/${versionId}/publish`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to publish");
      setVersions((prev) =>
        prev.map((v) => (v.id === versionId ? { ...v, status: body.data.version.status } : v)),
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Version</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Runner</th>
              <th className="p-3 font-medium">Checksum</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  No versions yet.
                </td>
              </tr>
            )}
            {versions.map((v) => (
              <tr key={v.id} className="border-b last:border-0">
                <td className="p-3 font-mono">
                  <Link href={`/skills/${skillId}/versions/${v.id}`} className="hover:underline">
                    {v.version}
                  </Link>
                </td>
                <td className="p-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[v.status] ?? "bg-muted"}`}
                  >
                    {v.status}
                  </span>
                </td>
                <td className="p-3 text-xs">{v.runnerType}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {v.checksum.slice(0, 12)}…
                </td>
                <td className="p-3 text-right">
                  {canPublish && v.status === "draft" && (
                    <Button variant="outline" size="sm" onClick={() => publish(v.id)}>
                      Publish
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold">
            Add draft version
          </summary>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Runner type</span>
              <select
                value={runnerType}
                onChange={(e) => setRunnerType(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="mock">mock</option>
                <option value="http">http</option>
                <option value="local_worker">local_worker</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Manifest (JSON)</span>
              <textarea
                value={manifest}
                onChange={(e) => setManifest(e.target.value)}
                rows={14}
                className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={createVersion} disabled={busy}>
              {busy ? "Creating…" : "Create draft version"}
            </Button>
          </div>
        </details>
      )}
      {!canWrite && error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
