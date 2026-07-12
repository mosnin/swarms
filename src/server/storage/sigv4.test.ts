import { describe, expect, it } from "vitest";

import { presignUrl, signingKey } from "@/server/storage/sigv4";

describe("SigV4 signing key derivation", () => {
  // AWS-documented test vector ("Deriving the signing key" example):
  // secret "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", 20120215, us-east-1, iam.
  it("matches the AWS reference signing key", () => {
    const key = signingKey(
      "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      "20120215",
      "us-east-1",
      "iam",
    );
    expect(key.toString("hex")).toBe(
      "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d",
    );
  });
});

describe("presignUrl", () => {
  it("produces a deterministic, well-formed presigned GET URL", () => {
    const url = presignUrl({
      method: "GET",
      host: "my-bucket.s3.us-east-1.amazonaws.com",
      key: "artifacts/report.pdf",
      region: "us-east-1",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      expiresSeconds: 900,
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(url).toContain("https://my-bucket.s3.us-east-1.amazonaws.com/artifacts/report.pdf?");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Credential=AKIDEXAMPLE%2F20260101%2Fus-east-1%2Fs3%2Faws4_request");
    expect(url).toContain("X-Amz-Expires=900");
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
    // Deterministic: same inputs → identical signature.
    const url2 = presignUrl({
      method: "GET",
      host: "my-bucket.s3.us-east-1.amazonaws.com",
      key: "artifacts/report.pdf",
      region: "us-east-1",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      expiresSeconds: 900,
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(url).toBe(url2);
  });

  it("supports path-style buckets (R2 / MinIO)", () => {
    const url = presignUrl({
      method: "PUT",
      host: "abc123.r2.cloudflarestorage.com",
      basePath: "my-bucket",
      key: "a/b.json",
      region: "auto",
      accessKeyId: "AKID",
      secretAccessKey: "secret",
      expiresSeconds: 300,
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(url).toContain("https://abc123.r2.cloudflarestorage.com/my-bucket/a/b.json?");
  });
});
