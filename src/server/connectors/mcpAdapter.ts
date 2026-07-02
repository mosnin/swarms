/**
 * MCP-compatible adapter. Wraps a {@link Connector} in the Model Context
 * Protocol shape (`listTools` / `callTool`) so connectors can later be exposed
 * as real MCP servers, or consumed by MCP clients, without changing connector
 * implementations. This is the interface boundary only — no transport yet.
 */

import type { Connector, ConnectorCallContext } from "@/server/connectors/types";

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  isError: boolean;
  content: unknown;
}

export interface McpServerLike {
  listTools(): McpToolDescriptor[];
  callTool(name: string, input: unknown, ctx: ConnectorCallContext): Promise<McpCallResult>;
}

/** Adapt a connector to the MCP server-like interface. */
export function toMcpServer(connector: Connector): McpServerLike {
  return {
    listTools() {
      return connector.listTools().map((t) => ({
        name: t.toolName,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    },
    async callTool(name, input, ctx) {
      const result = await connector.callTool(name, input, ctx);
      return result.ok
        ? { isError: false, content: result.output }
        : { isError: true, content: result.error };
    },
  };
}
