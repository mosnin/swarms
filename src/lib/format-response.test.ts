import { describe, expect, it } from "vitest";

import { formatResponse } from "@/lib/format-response";

describe("formatResponse", () => {
  const makeReq = (url: string) => ({ url });

  it("returns JSON by default", () => {
    const res = formatResponse(makeReq("http://localhost/api/v1/skills"), { hello: "world" });
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("returns JSON when format is not markdown", () => {
    const res = formatResponse(makeReq("http://localhost/api/v1/skills?format=json"), { x: 1 });
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("returns markdown when ?format=markdown", async () => {
    const res = formatResponse(makeReq("http://localhost/api/v1/skills?format=markdown"), { id: "foo", name: "Foo" });
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toContain("**id**");
    expect(body).toContain("foo");
    expect(body).toContain("**name**");
    expect(body).toContain("Foo");
  });

  it("renders arrays as numbered list at depth 0", async () => {
    const res = formatResponse(makeReq("http://localhost/?format=markdown"), ["a", "b", "c"]);
    const body = await res.text();
    expect(body).toContain("1. a");
    expect(body).toContain("2. b");
  });

  it("passes extra headers through in JSON mode", () => {
    const res = formatResponse(
      makeReq("http://localhost/"),
      {},
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("passes extra headers through in markdown mode", () => {
    const res = formatResponse(
      makeReq("http://localhost/?format=markdown"),
      {},
      { headers: { Etag: '"v1"' } },
    );
    expect(res.headers.get("etag")).toBe('"v1"');
  });

  it("respects custom status codes", () => {
    const res = formatResponse(makeReq("http://localhost/"), {}, { status: 404 });
    expect(res.status).toBe(404);
  });
});
