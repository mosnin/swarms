import { expect, test } from "@playwright/test";

test("liveness endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.service).toBe("swarms");
});

test("readiness endpoint responds with a status", async ({ request }) => {
  const res = await request.get("/api/ready");
  // 200 when the database is reachable, 503 otherwise — both are valid shapes.
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(body).toHaveProperty("checks.database");
});
