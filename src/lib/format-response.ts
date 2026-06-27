/**
 * Shared response formatter. When the caller passes ?format=markdown the data
 * is rendered as a human-readable Markdown document; otherwise plain JSON is
 * returned. Both paths produce the same HTTP status code and caching headers.
 *
 * Markdown rendering is intentionally minimal: objects become definition lists,
 * arrays of objects become fenced code blocks or flat lists depending on depth.
 * The goal is agent-readable, not publication-quality.
 */

type Headers = Record<string, string>;

function wantsMarkdown(url: string | URL): boolean {
  const u = typeof url === "string" ? new URL(url, "http://localhost") : url;
  return u.searchParams.get("format") === "markdown";
}

function toMarkdown(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "_null_";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    // Multi-line strings → fenced block
    if (value.includes("\n")) return `\`\`\`\n${value}\n\`\`\``;
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "_empty list_";
    return value
      .map((item, i) => {
        const rendered = toMarkdown(item, depth + 1);
        return `${depth === 0 ? `${i + 1}. ` : "- "}${rendered}`;
      })
      .join("\n");
  }
  if (typeof value === "object") {
    const indent = "  ".repeat(depth);
    const lines: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const rendered = toMarkdown(v, depth + 1);
      // Nested objects on the next line, scalars inline.
      if (typeof v === "object" && v !== null) {
        lines.push(`${indent}**${k}**:\n${rendered}`);
      } else {
        lines.push(`${indent}**${k}**: ${rendered}`);
      }
    }
    return lines.join("\n\n");
  }
  return String(value);
}

export function formatResponse(
  request: { url: string },
  data: unknown,
  options: { status?: number; headers?: Headers } = {},
): Response {
  const status = options.status ?? 200;
  const extraHeaders = options.headers ?? {};

  if (wantsMarkdown(request.url)) {
    const body = toMarkdown(data);
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/markdown; charset=utf-8", ...extraHeaders },
    });
  }

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
