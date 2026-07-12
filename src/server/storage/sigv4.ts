/**
 * Minimal AWS Signature V4 presigner for S3-compatible object stores (AWS S3,
 * Cloudflare R2, MinIO). Presigned URLs let a client GET/PUT an object directly
 * against the bucket without the control plane proxying bytes, and without ever
 * exposing the secret key.
 *
 * Only the query-string presign flow is implemented (that's all the artifact
 * paths need). The HMAC signing-key derivation is covered by the AWS-documented
 * test vector in sigv4.test.ts.
 */

import { createHash, createHmac } from "node:crypto";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** Derive the SigV4 signing key: HMAC chain over date → region → service. */
export function signingKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/** RFC-3986 encode, S3-style (encode everything except unreserved; keep `/` optional). */
function uriEncode(str: string, encodeSlash: boolean): string {
  let out = "";
  for (const ch of str) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      out += [...Buffer.from(ch)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("");
    }
  }
  return out;
}

export interface PresignParams {
  method: "GET" | "PUT";
  /** Full base endpoint for the bucket, e.g. https://<bucket>.<host> or https://<host>/<bucket>. */
  host: string; // host header value only (no scheme), e.g. "bucket.s3.amazonaws.com"
  protocol?: "https" | "http";
  key: string; // object key (path within the bucket), no leading slash
  region: string;
  service?: string; // default "s3"
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  /** ISO time; injected in tests for determinism. */
  now: Date;
  /** Optional extra path prefix when the bucket is part of the path (path-style). */
  basePath?: string;
}

/**
 * Build a presigned URL (query-string auth). Deterministic given `now`, so it is
 * unit-testable. Caller supplies the resolved host/basePath for their provider
 * (virtual-hosted for AWS, path-style for R2/MinIO).
 */
export function presignUrl(p: PresignParams): string {
  const service = p.service ?? "s3";
  const protocol = p.protocol ?? "https";
  const amzDate = p.now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${p.region}/${service}/aws4_request`;

  const canonicalUri =
    (p.basePath ? `/${p.basePath.replace(/^\/|\/$/g, "")}` : "") + "/" + uriEncode(p.key, false);

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${p.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(p.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k, true)}=${uriEncode(query[k]!, true)}`)
    .join("&");

  const canonicalHeaders = `host:${p.host}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    p.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const key = signingKey(p.secretAccessKey, dateStamp, p.region, service);
  const signature = createHmac("sha256", key).update(stringToSign, "utf8").digest("hex");

  return `${protocol}://${p.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
