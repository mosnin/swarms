/**
 * Connector registry. Resolves a connector slug to its implementation. Built-in
 * mock connectors are registered here; real provider connectors would register
 * the same way once implemented.
 */

import { crmMock, gmailDraftMock, webSearchMock } from "@/server/connectors/mockConnector";
import type { Connector } from "@/server/connectors/types";

const REGISTRY = new Map<string, Connector>(
  [webSearchMock, crmMock, gmailDraftMock].map((c) => [c.slug, c]),
);

export function getConnector(slug: string): Connector | null {
  return REGISTRY.get(slug) ?? null;
}

export function listConnectors(): Connector[] {
  return [...REGISTRY.values()];
}
