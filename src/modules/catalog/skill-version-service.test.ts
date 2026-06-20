import { beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "@/lib/time";
import {
  deprecateSkillVersion,
  publishSkillVersion,
  updateDraftContent,
  yankSkillVersion,
  type SkillVersionRecord,
  type SkillVersionStore,
} from "@/modules/catalog/skill-version-service";

/** In-memory store. The persistence layer can update; the SERVICE enforces immutability. */
class InMemorySkillVersionStore implements SkillVersionStore {
  private readonly rows = new Map<string, SkillVersionRecord>();

  seed(record: SkillVersionRecord): void {
    this.rows.set(record.id, record);
  }

  async findById(id: string): Promise<SkillVersionRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async update(id: string, patch: Partial<SkillVersionRecord>): Promise<SkillVersionRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error("missing");
    const next = { ...existing, ...patch };
    this.rows.set(id, next);
    return next;
  }
}

const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));

function draft(): SkillVersionRecord {
  return {
    id: "skv_test",
    skillId: "skl_test",
    organizationId: "org_test",
    version: "1.0.0",
    status: "draft",
    manifest: { entry: "run" },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    priceMinor: 100,
    priceCurrency: "USD",
    publishedAt: null,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  };
}

describe("skill version immutability", () => {
  let store: InMemorySkillVersionStore;

  beforeEach(() => {
    store = new InMemorySkillVersionStore();
    store.seed(draft());
  });

  it("allows editing draft content", async () => {
    const updated = await updateDraftContent(store, "skv_test", { priceMinor: 250 }, clock);
    expect(updated.priceMinor).toBe(250);
    expect(updated.status).toBe("draft");
  });

  it("publishing stamps publishedAt and flips status", async () => {
    const published = await publishSkillVersion(store, "skv_test", clock);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toEqual(clock.now());
  });

  it("rejects content edits after publish (immutable)", async () => {
    await publishSkillVersion(store, "skv_test", clock);
    await expect(
      updateDraftContent(store, "skv_test", { manifest: { entry: "tampered" } }, clock),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // The stored manifest is unchanged.
    const after = await store.findById("skv_test");
    expect(after?.manifest).toEqual({ entry: "run" });
  });

  it("rejects republishing an already published version", async () => {
    await publishSkillVersion(store, "skv_test", clock);
    await expect(publishSkillVersion(store, "skv_test", clock)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects edits after deprecate/yank too", async () => {
    await publishSkillVersion(store, "skv_test", clock);
    await deprecateSkillVersion(store, "skv_test", clock);
    await expect(
      updateDraftContent(store, "skv_test", { version: "1.0.1" }, clock),
    ).rejects.toThrow();

    await yankSkillVersion(store, "skv_test", clock);
    await expect(
      updateDraftContent(store, "skv_test", { version: "1.0.2" }, clock),
    ).rejects.toThrow();
  });
});
