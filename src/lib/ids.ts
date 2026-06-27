/**
 * Stable, prefixed public identifiers. Clients only ever see these — we never
 * expose sequential integer primary keys. Each id is `<prefix>_<random>` where
 * the random part is 22 URL-safe base62 characters (~131 bits of entropy).
 */

import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEFAULT_SIZE = 22;

/** Generate a random base62 string of `size` characters (rejection-sampled). */
export function randomBase62(size: number = DEFAULT_SIZE): string {
  let out = "";
  // Rejection sampling avoids modulo bias: only accept bytes < 248 (4 * 62).
  while (out.length < size) {
    const bytes = randomBytes(size);
    for (let i = 0; i < bytes.length && out.length < size; i += 1) {
      const byte = bytes[i] as number;
      if (byte < 248) out += ALPHABET[byte % 62];
    }
  }
  return out;
}

/** Known entity id prefixes. Keep in sync with the schema. */
export const IdPrefix = {
  user: "usr",
  organization: "org",
  organizationMember: "mem",
  apiKey: "key",
  wallet: "wlt",
  connector: "con",
  connectorAccount: "cna",
  connectorPermission: "cnp",
  job: "job",
  jobStep: "jst",
  workerRun: "wkr",
  executionLog: "log",
  auditEvent: "aud",
  ledgerEntry: "led",
  paymentAttempt: "pya",
  paymentReceipt: "pyr",
  budget: "bdg",
  policyRule: "pol",
  resourceBundle: "rsb",
  swarmRun: "swr",
  swarmAgent: "swa",
  webhookDelivery: "whd",
  webhookEndpoint: "whe",
} as const;

export type IdPrefix = (typeof IdPrefix)[keyof typeof IdPrefix];

/** Build a prefixed public id, e.g. `newId(IdPrefix.organization)`. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBase62()}`;
}

/** A `$defaultFn` factory for Drizzle text primary keys. */
export function idFactory(prefix: IdPrefix): () => string {
  return () => newId(prefix);
}

/** Whether a value looks like an id for the given prefix. */
export function isId(value: unknown, prefix: IdPrefix): value is string {
  return typeof value === "string" && value.startsWith(`${prefix}_`);
}
