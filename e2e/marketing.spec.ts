import { expect, test } from "@playwright/test";

/**
 * Marketing smoke suite. These pages are statically rendered and hit no
 * database, so they exercise the build, routing, layout, and navigation end to
 * end without any seeded data — a fast tripwire for a broken deploy.
 */

test("home page renders the hero and primary navigation", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/Swarms/);
  // The sign-in call to action is always present in the marketing chrome.
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
});

test("pricing page loads", async ({ page }) => {
  const res = await page.goto("/pricing");
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/Pricing/);
});

test("docs page loads", async ({ page }) => {
  const res = await page.goto("/docs");
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/Docs/);
});

test("changelog page shows dated entries", async ({ page }) => {
  const res = await page.goto("/changelog");
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/Changelog/);
  await expect(page.getByRole("heading", { name: /a little sharper/i })).toBeVisible();
});

test("status page reports operational components", async ({ page }) => {
  const res = await page.goto("/status");
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/Status/);
  // At least one component pill reads "Operational".
  await expect(page.getByText(/operational/i).first()).toBeVisible();
});

test("a feature page renders", async ({ page }) => {
  const res = await page.goto("/features/hosted-agents");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("footer links from the home page reach changelog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Changelog" }).first().click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page).toHaveTitle(/Changelog/);
});
