import { SignInNotice } from "@/app/(dashboard)/_components/sign-in-notice";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { tryCurrentContext } from "@/modules/identity/current";
import { listArtifacts } from "@/modules/artifacts/artifact-service";

export const dynamic = "force-dynamic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

export default async function ArtifactsPage() {
  const ctx = await tryCurrentContext();
  if (!ctx) return <SignInNotice />;

  const artifacts = await listArtifacts(ctx, { limit: 100 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Artifacts"
        description="Files produced by runs — reports, transcripts, exports. Content-hashed, retention-bound."
      />

      <DataTable>
        <THead>
          <TR>
            <TH>File</TH>
            <TH>Type</TH>
            <TH>Size</TH>
            <TH>Run</TH>
            <TH>Expires</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <tbody>
          {artifacts.length === 0 && (
            <EmptyRow colSpan={6}>No artifacts yet. Upload via POST /api/v1/artifacts or produce them from runs.</EmptyRow>
          )}
          {artifacts.map((a) => (
            <TR key={a.id}>
              <TD className="text-xs">
                {/* Session-cookie authenticated download; s3 provider redirects to a signed URL. */}
                <a href={`/api/v1/artifacts/${a.id}/download`} className="font-medium hover:underline">
                  {a.filename}
                </a>
              </TD>
              <TD className="text-xs text-muted-foreground">{a.contentType}</TD>
              <TD className="text-xs tabular-nums">{formatBytes(a.sizeBytes)}</TD>
              <TD className="font-mono text-xs text-muted-foreground">
                {a.jobId ?? a.swarmRunId ?? a.simulationRunId ?? "—"}
              </TD>
              <TD className="text-xs text-muted-foreground">
                {a.expiresAt ? new Date(a.expiresAt).toLocaleDateString() : "kept"}
              </TD>
              <TD className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</TD>
            </TR>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
