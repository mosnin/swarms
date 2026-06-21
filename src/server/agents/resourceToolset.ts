/**
 * Resource toolset — turns a decrypted {@link ResourceBundle} into REAL callable
 * tools the spawned worker agent can invoke during its loop. This is what makes
 * resource inheritance real rather than described: the worker doesn't just get
 * told it "has" the parent's files and MCP servers — it can actually read the
 * files and call the tools, and the results flow back into its reasoning.
 *
 * Two classes of tool are produced:
 *  - File access (`list_files` / `read_file`) backed by the inherited files.
 *  - One proxy tool per inherited MCP server, which performs a real MCP
 *    `tools/call` over HTTP (injectable transport so it is unit-testable and so
 *    secrets/auth are applied server-side, never exposed to the model).
 *
 * Secrets (`resources.env`) are NEVER exposed as a tool or returned to the
 * model. They are applied only inside the MCP transport (as auth/headers).
 */

import { z } from "zod";

import { logger } from "@/lib/logger";
import type { McpServerSpec, ResourceBundle } from "@/modules/resources/resource-bundle";

/** A model-callable tool. `parameters` is a Zod object schema (SDK-compatible). */
export interface ResourceTool {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface McpTransportCall {
  server: McpServerSpec;
  toolName: string;
  args: Record<string, unknown>;
  /** Inherited secrets, available server-side as auth/headers — never sent to the model. */
  env: Record<string, string>;
}

export type McpTransport = (
  call: McpTransportCall,
) => Promise<{ ok: true; content: unknown } | { ok: false; content: { code: string; message: string } }>;

const MCP_TIMEOUT_MS = 20_000;
const MCP_MAX_ATTEMPTS = 3;
const MCP_BACKOFF_MS = [0, 500, 2_000];

/**
 * Default MCP transport: a real JSON-RPC 2.0 `tools/call` over HTTP against the
 * inherited server's streamable endpoint. Bounded timeout + exponential-backoff
 * retries; never throws — failures map to a structured error returned to the
 * agent so its loop can react.
 */
export const defaultMcpTransport: McpTransport = async ({ server, toolName, args }) => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (server.token) headers.authorization = `Bearer ${server.token}`;

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });

  let lastError = "MCP call failed";
  for (let attempt = 0; attempt < MCP_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await delay(MCP_BACKOFF_MS[attempt] ?? 2_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);
    try {
      const res = await fetch(server.url, { method: "POST", headers, body, signal: controller.signal });
      if (!res.ok) {
        lastError = `MCP server ${server.name} returned ${res.status}`;
        // Retry only transient (5xx) failures; 4xx is terminal.
        if (res.status < 500) return { ok: false, content: { code: "UPSTREAM_ERROR", message: lastError } };
        continue;
      }
      const json = (await res.json().catch(() => null)) as
        | { result?: { content?: unknown; isError?: boolean }; error?: { message?: string } }
        | null;
      if (json?.error) {
        return { ok: false, content: { code: "UPSTREAM_ERROR", message: json.error.message ?? "MCP error" } };
      }
      if (json?.result?.isError) {
        return { ok: false, content: { code: "TOOL_ERROR", message: stringifyContent(json.result.content) } };
      }
      return { ok: true, content: json?.result?.content ?? null };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      lastError = aborted ? `MCP call to ${server.name} timed out` : `MCP call to ${server.name} failed`;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, content: { code: "UPSTREAM_ERROR", message: lastError } };
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringifyContent(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content ?? "");
}

/** Sanitize an MCP server name into a stable, model-friendly tool identifier. */
export function mcpToolName(serverName: string): string {
  const slug = serverName.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return `mcp_${slug || "server"}`;
}

export interface BuildToolsOptions {
  mcpTransport?: McpTransport;
}

/**
 * Build the real callable toolset from an inherited resource bundle. Returns an
 * empty array when there is nothing to inherit (the worker then runs on context
 * alone).
 */
export function buildResourceTools(
  resources: ResourceBundle,
  opts: BuildToolsOptions = {},
): ResourceTool[] {
  const transport = opts.mcpTransport ?? defaultMcpTransport;
  const env = resources.env ?? {};
  const files = resources.files ?? {};
  const tools: ResourceTool[] = [];

  if (Object.keys(files).length > 0) {
    tools.push({
      name: "list_files",
      description: "List the paths of the files inherited from the parent agent's workspace.",
      parameters: z.object({}),
      execute: async () => ({ files: Object.keys(files) }),
    });
    tools.push({
      name: "read_file",
      description: "Read the full contents of an inherited file by its exact path.",
      parameters: z.object({ path: z.string() }),
      execute: async (args) => {
        const path = typeof args.path === "string" ? args.path : "";
        if (!(path in files)) {
          return { error: `No such file: ${path}. Use list_files to see available paths.` };
        }
        return { path, contents: files[path] };
      },
    });
  }

  for (const server of resources.mcpServers ?? []) {
    const name = mcpToolName(server.name);
    tools.push({
      name,
      description: `Call a tool on the inherited MCP server "${server.name}". Pass the MCP tool name and its arguments.`,
      parameters: z.object({
        tool: z.string(),
        arguments: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async (args) => {
        const toolName = typeof args.tool === "string" ? args.tool : "";
        const callArgs = (args.arguments as Record<string, unknown> | undefined) ?? {};
        if (!toolName) return { error: "Missing 'tool' (the MCP tool name to call)." };
        const result = await transport({ server, toolName, args: callArgs, env });
        if (!result.ok) {
          logger.warn("inherited MCP tool call failed", { server: server.name, tool: toolName });
          return { error: result.content.message };
        }
        return result.content;
      },
    });
  }

  return tools;
}
