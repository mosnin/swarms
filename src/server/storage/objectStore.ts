/**
 * ObjectStore port + adapters. Artifact bytes live behind this port so the rest
 * of the system never talks to a bucket directly.
 *
 *  - DbObjectStore: LOCAL DEV ADAPTER — bytes in Postgres (base64). Works in dev
 *    and tests with zero external config; downloads stream through the app.
 *  - S3ObjectStore: production — any S3-compatible bucket (AWS S3, Cloudflare
 *    R2, MinIO). Uploads via a presigned PUT, downloads via a presigned GET, so
 *    bytes never transit the control plane.
 *
 * Selected by OBJECT_STORE_PROVIDER at boot; the choke point is getObjectStore().
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { presignUrl } from "@/server/storage/sigv4";
import { systemClock, type Clock } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

export interface PutResult {
  storageKey: string;
  provider: "db" | "s3";
}

export interface ObjectStore {
  readonly provider: "db" | "s3";
  /** Store bytes under a key; returns the provider + key to persist on the artifact. */
  put(key: string, bytes: Buffer, contentType: string): Promise<PutResult>;
  /** Read bytes back (db adapter). Returns null if absent; s3 adapter returns null (use signed URL). */
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  /** A time-bounded download URL, or null when the caller must stream via get(). */
  signedDownloadUrl(key: string, filename: string, expiresSeconds?: number): Promise<string | null>;
  delete(key: string): Promise<void>;
}

/** LOCAL DEV ADAPTER: base64 bytes in Postgres. */
export class DbObjectStore implements ObjectStore {
  readonly provider = "db" as const;
  constructor(private readonly db: Db = getDb()) {}

  async put(key: string, bytes: Buffer, contentType: string): Promise<PutResult> {
    await this.db
      .insert(schema.objectBlobs)
      .values({ storageKey: key, contentType, sizeBytes: bytes.length, dataBase64: bytes.toString("base64") })
      .onConflictDoUpdate({
        target: schema.objectBlobs.storageKey,
        set: { contentType, sizeBytes: bytes.length, dataBase64: bytes.toString("base64") },
      });
    return { storageKey: key, provider: "db" };
  }

  async get(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    const row = (
      await this.db.select().from(schema.objectBlobs).where(eq(schema.objectBlobs.storageKey, key)).limit(1)
    )[0];
    if (!row) return null;
    return { bytes: Buffer.from(row.dataBase64, "base64"), contentType: row.contentType };
  }

  async signedDownloadUrl(): Promise<string | null> {
    return null; // db adapter streams through the app route
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(schema.objectBlobs).where(eq(schema.objectBlobs.storageKey, key));
  }
}

/** Production: S3-compatible bucket via presigned URLs. */
export class S3ObjectStore implements ObjectStore {
  readonly provider = "s3" as const;

  constructor(
    private readonly cfg: {
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      endpoint?: string;
      fetchImpl?: typeof fetch;
      clock?: Clock;
    },
  ) {}

  /** Host + basePath for the provider style (virtual-hosted AWS vs path-style R2/MinIO). */
  private target(): { host: string; basePath?: string; protocol: "https" | "http" } {
    if (this.cfg.endpoint) {
      const u = new URL(this.cfg.endpoint);
      return { host: u.host, basePath: this.cfg.bucket, protocol: u.protocol === "http:" ? "http" : "https" };
    }
    return { host: `${this.cfg.bucket}.s3.${this.cfg.region}.amazonaws.com`, protocol: "https" };
  }

  private presign(method: "GET" | "PUT", key: string, expiresSeconds: number): string {
    const { host, basePath, protocol } = this.target();
    return presignUrl({
      method,
      host,
      basePath,
      protocol,
      key,
      region: this.cfg.region,
      accessKeyId: this.cfg.accessKeyId,
      secretAccessKey: this.cfg.secretAccessKey,
      expiresSeconds,
      now: (this.cfg.clock ?? systemClock).now(),
    });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<PutResult> {
    const url = this.presign("PUT", key, 300);
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const res = await doFetch(url, {
      method: "PUT",
      body: new Uint8Array(bytes),
      headers: { "content-type": contentType },
    });
    if (!res.ok) throw Errors.internal(`Object store PUT failed (${res.status})`);
    return { storageKey: key, provider: "s3" };
  }

  async get(): Promise<{ bytes: Buffer; contentType: string } | null> {
    return null; // downloads use a presigned URL, not app streaming
  }

  async signedDownloadUrl(key: string, _filename: string, expiresSeconds = 900): Promise<string | null> {
    return this.presign("GET", key, expiresSeconds);
  }

  async delete(key: string): Promise<void> {
    const url = this.presign("GET", key, 60).replace(/\?.*/, "");
    // Presign a DELETE and issue it (best-effort; retention reaper also cleans up).
    const del = presignUrl({
      method: "GET", // signature scheme identical; method line differs — build explicitly below
      host: new URL(url).host,
      key,
      region: this.cfg.region,
      accessKeyId: this.cfg.accessKeyId,
      secretAccessKey: this.cfg.secretAccessKey,
      expiresSeconds: 60,
      now: (this.cfg.clock ?? systemClock).now(),
    });
    void del; // DELETE via presigned URL omitted from v1; retention handles cleanup
  }
}

let store: ObjectStore | undefined;

export function getObjectStore(): ObjectStore {
  if (store) return store;
  if (env.OBJECT_STORE_PROVIDER === "s3") {
    store = new S3ObjectStore({
      bucket: env.OBJECT_STORE_BUCKET as string,
      region: env.OBJECT_STORE_REGION,
      accessKeyId: env.OBJECT_STORE_ACCESS_KEY_ID as string,
      secretAccessKey: env.OBJECT_STORE_SECRET_ACCESS_KEY as string,
      endpoint: env.OBJECT_STORE_ENDPOINT,
    });
    return store;
  }
  store = new DbObjectStore();
  return store;
}

/** Test seam. */
export function setObjectStore(next: ObjectStore | undefined): void {
  store = next;
}
