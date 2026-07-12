import { type NextRequest, NextResponse } from "next/server";

import { route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { getArtifactDownload } from "@/modules/artifacts/artifact-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sanitize a filename for a Content-Disposition header (strip quotes/controls). */
function safeFilename(name: string): string {
  return name.replace(/[^\w.\- ]/g, "_").slice(0, 200) || "artifact";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
): Promise<NextResponse> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { artifactId } = await params;
    const dl = await getArtifactDownload(ctx, artifactId);

    // S3 adapter: hand the client a short-lived signed URL so bytes never
    // transit the control plane.
    if (dl.kind === "redirect") return NextResponse.redirect(dl.url, 302);

    // DB adapter: stream the bytes with an attachment disposition.
    return new NextResponse(new Uint8Array(dl.bytes), {
      status: 200,
      headers: {
        "Content-Type": dl.contentType,
        "Content-Disposition": `attachment; filename="${safeFilename(dl.filename)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
