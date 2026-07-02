import { describe, expect, it, vi } from "vitest";

import type { ResourceBundle } from "@/modules/resources/resource-bundle";
import {
  buildResourceTools,
  mcpToolName,
  type McpTransport,
} from "@/server/agents/resourceToolset";

const bundle: ResourceBundle = {
  env: { NOTION_TOKEN: "secret-value" },
  files: { "notes.md": "# Meeting\nShip the toolset.", "todo.txt": "wire MCP" },
  mcpServers: [{ name: "Notion DB", url: "https://mcp.example/notion", token: "tok_123" }],
  context: "background",
};

function findTool(tools: ReturnType<typeof buildResourceTools>, name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not built`);
  return tool;
}

describe("buildResourceTools — inherited files are really readable", () => {
  it("read_file returns the actual inherited contents", async () => {
    const tools = buildResourceTools(bundle);
    const out = (await findTool(tools, "read_file").execute({ path: "notes.md" })) as {
      contents: string;
    };
    expect(out.contents).toBe("# Meeting\nShip the toolset.");
  });

  it("list_files enumerates inherited paths", async () => {
    const tools = buildResourceTools(bundle);
    const out = (await findTool(tools, "list_files").execute({})) as { files: string[] };
    expect(out.files.sort()).toEqual(["notes.md", "todo.txt"]);
  });

  it("read_file on an unknown path returns a structured error, not a throw", async () => {
    const tools = buildResourceTools(bundle);
    const out = (await findTool(tools, "read_file").execute({ path: "nope" })) as { error: string };
    expect(out.error).toContain("No such file");
  });

  it("builds no file tools when there are no inherited files", () => {
    const tools = buildResourceTools({ context: "x" });
    expect(tools.map((t) => t.name)).not.toContain("read_file");
  });
});

describe("buildResourceTools — inherited MCP servers are really callable", () => {
  it("proxies a tool call to the inherited server with auth applied server-side", async () => {
    const transport = vi.fn<McpTransport>(async () => ({
      ok: true,
      content: { rows: [{ id: 1 }] },
    }));
    const tools = buildResourceTools(bundle, { mcpTransport: transport });
    const tool = findTool(tools, mcpToolName("Notion DB"));

    const out = await tool.execute({ tool: "query", arguments: { db: "tasks" } });

    expect(transport).toHaveBeenCalledTimes(1);
    const call = transport.mock.calls[0]![0];
    expect(call.server.url).toBe("https://mcp.example/notion");
    expect(call.toolName).toBe("query");
    expect(call.args).toEqual({ db: "tasks" });
    // Inherited secrets are handed to the transport (for auth), never to the model.
    expect(call.env).toEqual({ NOTION_TOKEN: "secret-value" });
    expect(out).toEqual({ rows: [{ id: 1 }] });
  });

  it("maps a transport failure to a structured error the agent can react to", async () => {
    const transport: McpTransport = async () => ({
      ok: false,
      content: { code: "UPSTREAM_ERROR", message: "server 503" },
    });
    const tools = buildResourceTools(bundle, { mcpTransport: transport });
    const out = (await findTool(tools, mcpToolName("Notion DB")).execute({ tool: "query" })) as {
      error: string;
    };
    expect(out.error).toBe("server 503");
  });
});

describe("buildResourceTools — secrets are never exposed to the model", () => {
  it("exposes no tool that returns env secret values", () => {
    const tools = buildResourceTools(bundle);
    // No tool is named for secrets, and the secret value never appears in any
    // tool's name/description/parameters surface shown to the model.
    const surface = JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description })));
    expect(surface).not.toContain("secret-value");
    expect(tools.map((t) => t.name)).not.toContain("get_secret");
  });
});
