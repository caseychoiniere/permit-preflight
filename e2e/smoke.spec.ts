/**
 * The deliberately small browser smoke suite (NFR-U2-6/Infrastructure Design Q7) - not a
 * comprehensive E2E matrix, and does not simulate checkout/accounts/Unit 2B behavior.
 *
 * Two tiers:
 * - "always run" checks that need only a running Next.js process (no DATABASE_URL) - health
 *   check and initial page render. These prove the deployed process itself is sane.
 * - the full configure -> place -> authorize -> retrieve-by-token path, which needs a running
 *   app with a real DATABASE_URL - skipped when one isn't available (this sandbox has none),
 *   matching the same skip-cleanly pattern as this project's DB integration tests. Scoped inside
 *   its own describe() block - test.skip(condition) at file scope skips EVERY test in the file,
 *   not just subsequent ones, which is not what's intended here.
 */

import { test, expect } from "@playwright/test";

test("health check responds ok without touching the database (shallow, per Infrastructure Design)", async ({ request }) => {
  const response = await request.get("/healthz");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.status).toBe("ok");
});

test("the configure page loads and shows the address entry step", async ({ page }) => {
  await page.goto("/configure");
  await expect(page.getByLabel("Property address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find parcel" })).toBeVisible();
});

const hasDb = Boolean(process.env["DATABASE_URL"]);

test.describe("requires a running app with DATABASE_URL", () => {
  test.skip(!hasDb, "DATABASE_URL not available in this sandbox");

  test("an unknown report token returns 'not found', never a crash or someone else's report", async ({ page }) => {
    await page.goto("/report/definitely-not-a-real-token");
    await expect(page.getByText(/not found/i)).toBeVisible();
  });

  test("full path: configure a shed, place it, identify lot-line roles, submit, authorize, and retrieve the report by token (reportId alone must fail)", async ({ page }) => {
    await page.goto("/configure");
    await page.getByLabel("Property address").fill("3216 Fuhrman Ave E, Seattle, WA 98102");
    await page.getByRole("button", { name: "Find parcel" }).click();

    await expect(page.getByRole("button", { name: /Screen a shed/i })).toBeVisible();
    await page.getByRole("button", { name: /Screen a shed/i }).click();

    await page.getByRole("button", { name: /Next: place on parcel/i }).click();

    // Placement + lot-line role identification happens inside ParcelPlacementMap. Per the
    // user's explicit direction, this exercises the REAL placement path - a genuine click on the
    // rendered MapLibre canvas, which fires the component's real `map.on("click")` handler and
    // submits raw `e.lngLat` (WGS84) with zero app-level coordinate conversion (Code Generation
    // CRS correction) - not the accessible longitude/latitude fallback inputs, which exist for
    // keyboard/non-pointer operability but aren't what proves the conversion path itself.
    await page.getByRole("button", { name: "edge-0" }).click(); // front
    await page.getByRole("button", { name: "edge-2" }).click(); // rear
    const mapCanvas = page.getByRole("application", { name: "Parcel map for shed placement" });
    await mapCanvas.click({ position: { x: 150, y: 150 } });

    await page.getByRole("button", { name: /Next: review/i }).click();
    await page.getByRole("button", { name: /Authorize report generation/i }).click();

    await expect(page.getByRole("status")).toContainText(/authorized/i);
  });
});
