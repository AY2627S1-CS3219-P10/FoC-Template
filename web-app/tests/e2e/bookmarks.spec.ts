/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of bookmarks test cases.
 * Author review: Validated the assertions and setup for "courier stars, reloads, filters, and removes saved errands" against the browser actions and mocked responses; clarified test descriptions and assertion formatting.
 */

import { test, expect } from "@playwright/test";

const user = { id: "10000000-0000-4000-8000-000000000001", username: "Courier", isAdmin: false };
const errand = {
  id: "30000000-0000-4000-8000-000000000001", status: "OPEN",
  description: "Collect coffee", pickupSupplierName: "Cafe", pickupLocationLabel: "Library",
  deliveryDestination: "UTown", offeredCredits: 20, createdAt: "2026-11-01T01:00:00Z",
};

test("courier stars, reloads, filters, and removes saved errands", async ({ page }) => {
  let starred = false;
  let listRequests = 0;
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: user }));
  await page.route("**/api/credits", (route) => route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }));
  await page.route("**/api/errands?*", (route) => {
    listRequests++;
    const scope = new URL(route.request().url()).searchParams.get("scope");
    return route.fulfill({ json: scope === "starred" && !starred ? [] : [{ ...errand, isStarred: starred }] });
  });
  await page.route(`**/api/errands/${errand.id}/star`, (route) => {
    expect(route.request().headers()["content-type"]).toContain("application/json");
    expect(route.request().postDataJSON()).toEqual({});
    starred = route.request().method() === "POST";
    return route.fulfill({ json: { isStarred: starred } });
  });
  await page.goto("/errands");
  const star = page.getByRole("button", { name: "Star errand: Collect coffee", exact: true });
  await expect(star).toHaveAttribute("title", "Star");
  await expect(star).toHaveText("");
  await page.getByRole("article").evaluate((card) => card.setAttribute("data-stable-card", "true"));
  await page.getByRole("button", { name: "Star errand: Collect coffee", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unstar errand: Collect coffee" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Unstar errand: Collect coffee" })).toHaveCSS("color", "rgb(212, 154, 0)");
  await expect(page.getByRole("article")).toHaveAttribute("data-stable-card", "true");
  expect(listRequests).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Unstar errand: Collect coffee" })).toBeVisible();
  await page.getByRole("button", { name: "Starred errands" }).click();
  await expect(page).toHaveURL(/\/errands$/);
  await expect(page.getByRole("article")).toContainText("Collect coffee");
  await page.getByRole("button", { name: "Unstar errand: Collect coffee" }).click();
  await expect(page.getByRole("heading", { name: "No starred errands to show" })).toBeVisible();
});

test("failed saves preserve the star state and allow retry", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: user }));
  await page.route("**/api/credits", (route) => route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }));
  await page.route("**/api/errands?*", (route) => route.fulfill({ json: [errand] }));
  await page.route(`**/api/errands/${errand.id}/star`, (route) => route.fulfill({ status: 503, json: { message: "Could not save star" } }));
  await page.goto("/errands");
  const star = page.getByRole("button", { name: "Star errand: Collect coffee", exact: true });
  await star.click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not save star" })).toBeVisible();
  await expect(star).toBeEnabled();
  await expect(star).toHaveAttribute("aria-pressed", "false");
});

test("star adapter rejects cross-origin mutations", async ({ request }) => {
  for (const method of ["POST", "DELETE"]) {
    const response = await request.fetch(`/api/errands/${errand.id}/star`, { method, headers: { Origin: "https://untrusted.example" } });
    expect(response.status()).toBe(403);
  }
});

test("switching errand tabs preserves the board while results load", async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ...user, isAdmin: true } }));
  await page.route("**/api/credits", (route) => route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }));
  await page.route("**/api/errands?*", async (route) => {
    const scope = new URL(route.request().url()).searchParams.get("scope") ?? "open";
    if (scope !== "open") await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: [{ ...errand, description: `${scope} coffee`, isStarred: scope === "starred" }] });
  });
  await page.goto("/errands");
  await expect(page.getByRole("article")).toContainText("open coffee");
  await page.getByRole("article").evaluate((card) => card.setAttribute("data-stable-card", "true"));
  let previousScope = "open";
  for (const [tab, scope] of [["Starred errands", "starred"], ["All requests", "manage"], ["My deliveries", "assigned"]]) {
    await page.getByRole("button", { name: tab, exact: scope !== "starred" }).click();
    await expect(page.locator(".errand-view-results")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("article")).toContainText(`${previousScope} coffee`);
    await expect(page.getByRole("article")).toHaveAttribute("data-stable-card", "true");
    await expect(page.getByText("Loading open errands…")).toHaveCount(0);
    await expect.poll(() => Boolean(release)).toBe(true);
    release!();
    release = undefined;
    await expect(page.locator(".errand-view-results")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("article")).toContainText(`${scope} coffee`);
    previousScope = scope;
  }
});

test("finished errands are hidden from stars and deliveries have no star control", async ({ page }) => {
  let finished = false;
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ...user, isAdmin: true } }));
  await page.route("**/api/credits", (route) => route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }));
  await page.route("**/api/errands?*", (route) => {
    const scope = new URL(route.request().url()).searchParams.get("scope");
    if (scope === "manage" || (scope === "starred" && finished)) return route.fulfill({ json: [
      { ...errand, status: "EXPIRED", isStarred: true },
      { ...errand, id: "30000000-0000-4000-8000-000000000002", status: "COMPLETED", isStarred: true },
    ] });
    return route.fulfill({ json: [{ ...errand, isStarred: true }] });
  });
  await page.goto("/errands");
  await expect(page.locator(".errand-star-button")).toHaveCount(1);
  await page.getByRole("button", { name: "My deliveries", exact: true }).click();
  await expect(page.locator(".errand-view-results")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.locator(".errand-star-button")).toHaveCount(0);
  await page.getByRole("button", { name: "All requests", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.locator(".errand-star-button")).toHaveCount(0);
  await page.getByRole("button", { name: "Starred errands" }).click();
  await expect(page.locator(".errand-star-button")).toHaveCount(1);
  finished = true;
  await page.getByRole("button", { name: "Refresh errands" }).click();
  await expect(page.getByRole("heading", { name: "No starred errands to show" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});
