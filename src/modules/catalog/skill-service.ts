/**
 * Catalog service: skills and their versions. Every mutation passes server-side
 * permission + organization guards (the single choke point in
 * `access-control.ts`). Reads enforce visibility rules from `visibility.ts`.
 *
 * Content immutability of published versions is delegated to
 * `skill-version-service.ts` via a thin Postgres-backed store adapter, so the
 * same invariant is shared by the API and the dashboard.
 */

import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { requireOrganization, requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { sanitizePermissions } from "@/modules/identity/roles";
import {
  computeChecksum,
  parseManifest,
  RUNNER_TYPES,
  type RiskLevel,
  type RunnerType,
} from "@/modules/catalog/manifest";
import {
  publishSkillVersion as publishVersionRecord,
  type SkillVersionRecord,
  type SkillVersionStore,
} from "@/modules/catalog/skill-version-service";
import { canViewSkill, type SkillVisibility } from "@/modules/catalog/visibility";

type Db = ReturnType<typeof getDb>;
type SkillRow = typeof schema.skills.$inferSelect;
type SkillVersionRow = typeof schema.skillVersions.$inferSelect;

/* ------------------------------------------------------------------ */
/* Views (client-safe shapes)                                          */
/* ------------------------------------------------------------------ */

export interface SkillView {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: SkillVisibility;
  riskLevel: RiskLevel;
  tags: string[];
  requiredPermissions: string[];
  defaultPriceMinor: number;
  priceCurrency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillVersionView {
  id: string;
  skillId: string;
  version: string;
  status: SkillVersionRecord["status"];
  runnerType: RunnerType;
  checksum: string;
  priceMinor: number;
  priceCurrency: string;
  manifest: unknown;
  inputSchema: unknown;
  outputSchema: unknown;
  runnerConfig: unknown;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSkillView(row: SkillRow): SkillView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    visibility: row.visibility as SkillVisibility,
    riskLevel: row.riskLevel as RiskLevel,
    tags: row.tags ?? [],
    requiredPermissions: row.requiredPermissions ?? [],
    defaultPriceMinor: row.defaultPriceMinor,
    priceCurrency: row.priceCurrency,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toVersionView(row: SkillVersionRow): SkillVersionView {
  return {
    id: row.id,
    skillId: row.skillId,
    version: row.version,
    status: row.status as SkillVersionRecord["status"],
    runnerType: row.runnerType as RunnerType,
    checksum: row.checksum,
    priceMinor: row.priceMinor,
    priceCurrency: row.priceCurrency,
    manifest: row.manifest,
    inputSchema: row.inputSchema,
    outputSchema: row.outputSchema,
    runnerConfig: row.runnerConfig,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CreateSkillInput {
  slug: string;
  name: string;
  description?: string | null;
  visibility?: SkillVisibility;
  riskLevel?: RiskLevel;
  tags?: string[];
  requiredPermissions?: string[];
  defaultPriceMinor?: number;
  priceCurrency?: string;
}

export async function createSkill(
  ctx: AuthContext,
  input: CreateSkillInput,
  db: Db = getDb(),
): Promise<SkillView> {
  requirePermission(ctx, "skills.create");
  if (!SLUG_RE.test(input.slug)) {
    throw Errors.validation("slug must be lowercase kebab-case (a-z, 0-9, hyphens)");
  }
  if (input.defaultPriceMinor !== undefined && input.defaultPriceMinor < 0) {
    throw Errors.validation("defaultPriceMinor must be non-negative");
  }

  const existing = (
    await db
      .select({ id: schema.skills.id })
      .from(schema.skills)
      .where(and(eq(schema.skills.organizationId, ctx.organizationId), eq(schema.skills.slug, input.slug)))
      .limit(1)
  )[0];
  if (existing) throw Errors.conflict(`A skill with slug "${input.slug}" already exists`);

  const inserted = (
    await db
      .insert(schema.skills)
      .values({
        organizationId: ctx.organizationId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        visibility: input.visibility ?? "private",
        riskLevel: input.riskLevel ?? "low",
        tags: input.tags ?? [],
        requiredPermissions: sanitizePermissions(input.requiredPermissions ?? []),
        defaultPriceMinor: input.defaultPriceMinor ?? 0,
        priceCurrency: (input.priceCurrency ?? "USD").toUpperCase(),
      })
      .returning()
  )[0];
  if (!inserted) throw Errors.internal("Failed to create skill");
  return toSkillView(inserted);
}

export interface ListSkillsInput {
  /** Free-text match against name, slug, and description. */
  query?: string;
  /** Restrict to skills carrying this tag. */
  tag?: string;
  /** "owned": only this org's skills. "all" (default): owned + public. */
  scope?: "owned" | "all";
}

/**
 * List skills the caller may discover: their own (any visibility) plus other
 * orgs' public skills. Unlisted skills of other orgs are intentionally excluded
 * from listings (still readable by direct id via {@link getSkill}).
 */
export async function listSkills(
  ctx: AuthContext,
  input: ListSkillsInput = {},
  db: Db = getDb(),
): Promise<SkillView[]> {
  requirePermission(ctx, "skills.read");

  const conditions: SQL[] = [];
  const visibilityScope =
    input.scope === "owned"
      ? eq(schema.skills.organizationId, ctx.organizationId)
      : or(
          eq(schema.skills.organizationId, ctx.organizationId),
          eq(schema.skills.visibility, "public"),
        );
  if (visibilityScope) conditions.push(visibilityScope);

  if (input.query) {
    const like = `%${input.query}%`;
    const text = or(
      ilike(schema.skills.name, like),
      ilike(schema.skills.slug, like),
      ilike(schema.skills.description, like),
    );
    if (text) conditions.push(text);
  }
  if (input.tag) {
    conditions.push(sql`${schema.skills.tags} @> ARRAY[${input.tag}]::text[]`);
  }

  const rows = await db
    .select()
    .from(schema.skills)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(schema.skills.createdAt))
    .limit(200);
  return rows.map(toSkillView);
}

export interface SkillDetail {
  skill: SkillView;
  versions: SkillVersionView[];
}

/** Read a skill plus its versions, enforcing visibility. Hides private skills
 * of other orgs as `NOT_FOUND` (no existence leak). */
export async function getSkill(
  ctx: AuthContext,
  skillId: string,
  db: Db = getDb(),
): Promise<SkillDetail> {
  requirePermission(ctx, "skills.read");
  const row = (
    await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).limit(1)
  )[0];
  if (!row || !canViewSkill(ctx.organizationId, { organizationId: row.organizationId, visibility: row.visibility as SkillVisibility })) {
    throw Errors.notFound("Skill not found");
  }

  const versions = await db
    .select()
    .from(schema.skillVersions)
    .where(eq(schema.skillVersions.skillId, skillId))
    .orderBy(desc(schema.skillVersions.createdAt));

  return { skill: toSkillView(row), versions: versions.map(toVersionView) };
}

/* ------------------------------------------------------------------ */
/* Skill versions                                                      */
/* ------------------------------------------------------------------ */

export interface CreateVersionInput {
  manifest: unknown;
  runnerType: RunnerType;
  runnerConfig?: unknown;
  /** Optional explicit price; defaults to the manifest's estimated cost. */
  priceMinor?: number;
  priceCurrency?: string;
}

/** Load an org-owned skill for a write, or throw. */
async function loadOwnedSkill(ctx: AuthContext, skillId: string, db: Db): Promise<SkillRow> {
  const row = (
    await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).limit(1)
  )[0];
  if (!row) throw Errors.notFound("Skill not found");
  requireOrganization(ctx, row.organizationId);
  return row;
}

export async function createDraftVersion(
  ctx: AuthContext,
  skillId: string,
  input: CreateVersionInput,
  db: Db = getDb(),
): Promise<SkillVersionView> {
  requirePermission(ctx, "skills.create");
  const skill = await loadOwnedSkill(ctx, skillId, db);

  if (!RUNNER_TYPES.includes(input.runnerType)) {
    throw Errors.validation(`runnerType must be one of: ${RUNNER_TYPES.join(", ")}`);
  }
  const manifest = parseManifest(input.manifest);

  const duplicate = (
    await db
      .select({ id: schema.skillVersions.id })
      .from(schema.skillVersions)
      .where(
        and(
          eq(schema.skillVersions.skillId, skillId),
          eq(schema.skillVersions.version, manifest.version),
        ),
      )
      .limit(1)
  )[0];
  if (duplicate) {
    throw Errors.conflict(`Version ${manifest.version} already exists for this skill`);
  }

  const checksum = computeChecksum({
    manifest,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    runnerType: input.runnerType,
    runnerConfig: input.runnerConfig,
  });

  const inserted = (
    await db
      .insert(schema.skillVersions)
      .values({
        skillId,
        organizationId: skill.organizationId,
        version: manifest.version,
        status: "draft",
        manifest,
        inputSchema: manifest.inputSchema,
        outputSchema: manifest.outputSchema,
        runnerType: input.runnerType,
        runnerConfig: input.runnerConfig ?? null,
        checksum,
        priceMinor: input.priceMinor ?? manifest.estimatedCostMinor,
        priceCurrency: (input.priceCurrency ?? skill.priceCurrency).toUpperCase(),
      })
      .returning()
  )[0];
  if (!inserted) throw Errors.internal("Failed to create skill version");
  return toVersionView(inserted);
}

/** Postgres-backed adapter for the version immutability service. */
function dbVersionStore(db: Db): SkillVersionStore {
  return {
    async findById(id) {
      const row = (
        await db.select().from(schema.skillVersions).where(eq(schema.skillVersions.id, id)).limit(1)
      )[0];
      if (!row) return null;
      return {
        id: row.id,
        skillId: row.skillId,
        organizationId: row.organizationId,
        version: row.version,
        status: row.status as SkillVersionRecord["status"],
        manifest: row.manifest,
        inputSchema: row.inputSchema,
        outputSchema: row.outputSchema,
        priceMinor: row.priceMinor,
        priceCurrency: row.priceCurrency,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
    async update(id, patch) {
      const row = (
        await db
          .update(schema.skillVersions)
          .set(patch)
          .where(eq(schema.skillVersions.id, id))
          .returning()
      )[0];
      if (!row) throw Errors.internal("Failed to update skill version");
      return {
        id: row.id,
        skillId: row.skillId,
        organizationId: row.organizationId,
        version: row.version,
        status: row.status as SkillVersionRecord["status"],
        manifest: row.manifest,
        inputSchema: row.inputSchema,
        outputSchema: row.outputSchema,
        priceMinor: row.priceMinor,
        priceCurrency: row.priceCurrency,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
  };
}

export async function publishVersion(
  ctx: AuthContext,
  skillId: string,
  versionId: string,
  db: Db = getDb(),
): Promise<SkillVersionView> {
  requirePermission(ctx, "skills.publish");
  await loadOwnedSkill(ctx, skillId, db);

  // Confirm the version belongs to this skill before mutating.
  const version = (
    await db.select().from(schema.skillVersions).where(eq(schema.skillVersions.id, versionId)).limit(1)
  )[0];
  if (!version || version.skillId !== skillId) throw Errors.notFound("Skill version not found");

  await publishVersionRecord(dbVersionStore(db), versionId);

  const updated = (
    await db.select().from(schema.skillVersions).where(eq(schema.skillVersions.id, versionId)).limit(1)
  )[0];
  if (!updated) throw Errors.internal("Failed to load published version");
  return toVersionView(updated);
}
