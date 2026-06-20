/**
 * Skill version service. Enforces the rule that a skill version's **content is
 * immutable once published** — only its lifecycle status may advance
 * (published → deprecated → yanked). Draft versions may be edited freely.
 *
 * The service depends on a narrow {@link SkillVersionStore} port so it can be
 * unit-tested with an in-memory adapter and run against Postgres in production.
 */

import { Errors } from "@/lib/errors";
import { systemClock, type Clock } from "@/lib/time";

export type SkillVersionStatus = "draft" | "published" | "deprecated" | "yanked";

export interface SkillVersionRecord {
  id: string;
  skillId: string;
  organizationId: string;
  version: string;
  status: SkillVersionStatus;
  manifest: unknown;
  inputSchema: unknown;
  outputSchema: unknown;
  priceMinor: number;
  priceCurrency: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Mutable content of a draft version. */
export type SkillVersionContent = Pick<
  SkillVersionRecord,
  "version" | "manifest" | "inputSchema" | "outputSchema" | "priceMinor" | "priceCurrency"
>;

export interface SkillVersionStore {
  findById(id: string): Promise<SkillVersionRecord | null>;
  update(id: string, patch: Partial<SkillVersionRecord>): Promise<SkillVersionRecord>;
}

/** A published (or later) version's content can no longer change. */
export function isContentImmutable(record: SkillVersionRecord): boolean {
  return record.status !== "draft";
}

async function loadOrThrow(store: SkillVersionStore, id: string): Promise<SkillVersionRecord> {
  const record = await store.findById(id);
  if (!record) throw Errors.notFound(`Skill version ${id} not found`);
  return record;
}

/**
 * Edit a draft version's content. Throws `CONFLICT` once the version has been
 * published — content is immutable thereafter and a new version must be created.
 */
export async function updateDraftContent(
  store: SkillVersionStore,
  id: string,
  content: Partial<SkillVersionContent>,
  clock: Clock = systemClock,
): Promise<SkillVersionRecord> {
  const record = await loadOrThrow(store, id);
  if (isContentImmutable(record)) {
    throw Errors.conflict(
      `Skill version ${id} is ${record.status} and immutable; publish a new version instead`,
      { skillVersionId: id, status: record.status },
    );
  }
  return store.update(id, { ...content, updatedAt: clock.now() });
}

/**
 * Publish a draft version. Sets `status = published` and stamps `publishedAt`.
 * Throws `CONFLICT` if the version is not a draft (publishing is one-way).
 */
export async function publishSkillVersion(
  store: SkillVersionStore,
  id: string,
  clock: Clock = systemClock,
): Promise<SkillVersionRecord> {
  const record = await loadOrThrow(store, id);
  if (record.status !== "draft") {
    throw Errors.conflict(`Skill version ${id} is already ${record.status}; cannot publish again`, {
      skillVersionId: id,
      status: record.status,
    });
  }
  const now = clock.now();
  return store.update(id, { status: "published", publishedAt: now, updatedAt: now });
}

/** Advance a published version to `deprecated`. Content is untouched. */
export async function deprecateSkillVersion(
  store: SkillVersionStore,
  id: string,
  clock: Clock = systemClock,
): Promise<SkillVersionRecord> {
  const record = await loadOrThrow(store, id);
  if (record.status !== "published") {
    throw Errors.conflict(`Only published versions can be deprecated (got ${record.status})`);
  }
  return store.update(id, { status: "deprecated", updatedAt: clock.now() });
}

/** Yank a version (published or deprecated), making it unresolvable. */
export async function yankSkillVersion(
  store: SkillVersionStore,
  id: string,
  clock: Clock = systemClock,
): Promise<SkillVersionRecord> {
  const record = await loadOrThrow(store, id);
  if (record.status === "draft") {
    throw Errors.conflict("Draft versions cannot be yanked; delete the draft instead");
  }
  return store.update(id, { status: "yanked", updatedAt: clock.now() });
}
