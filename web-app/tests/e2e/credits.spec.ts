import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    id: "10000000-0000-4000-8000-000000000001", username: "CreditUser",
    email: "credits@u.nus.edu", phoneNumber: "81234567", status: "ACTIVE", isAdmin: false,
  } }));
});

test("balances refresh and recover from service failures", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/credits", (route) => {
    calls++;
    return calls === 2
      ? route.fulfill({ status: 503, json: { message: "The credit service is unavailable." } })
      : route.fulfill({ json: { availableCredits: calls === 1 ? 80 : 100, reservedCredits: calls === 1 ? 20 : 0 } });
  });
  await page.goto("/");
  const badge = page.getByRole("link", { name: "Credits: 80 available. View credits", exact: true });
  await expect(badge).toHaveText("80");
  await expect(badge).toHaveAttribute("href", "/credits");
  await expect(badge.locator("svg")).toBeVisible();
  await badge.click();
  await expect(page).toHaveURL(/\/credits$/);
  expect(calls).toBe(1);
  const credits = page.getByRole("region", { name: "Your credits" });
  await expect(credits.locator("dd")).toHaveText(["80", "20"]);
  await credits.getByRole("button", { name: "Refresh credits" }).click();
  await expect(credits.getByRole("alert")).toContainText("unavailable");
  await expect(credits.locator("dd")).toHaveCount(0);
  await credits.getByRole("button", { name: "Retry credits" }).click();
  await expect(credits.locator("dd")).toHaveText(["100", "0"]);
  await expect(page.getByRole("link", { name: "Credits: 100 available. View credits", exact: true })).toHaveText("100");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("provisions an unprovisioned verified account exactly once", async ({ page }) => {
  const methods: string[] = [];
  await page.route("**/api/credits", (route) => {
    const method = route.request().method();
    methods.push(method);
    return method === "GET"
      ? route.fulfill({ status: 404, json: { code: "ACCOUNT_NOT_FOUND", message: "Account not found" } })
      : route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } });
  });
  await page.goto("/credits");
  const credits = page.getByRole("region", { name: "Your credits" });
  await expect(credits.locator("dd")).toHaveText(["100", "0"]);
  await expect(credits.getByRole("alert")).toHaveCount(0);
  expect(methods).toEqual(["GET", "POST"]);
});

test("service authorization failures do not rotate a valid session", async ({ page }) => {
  let refreshes = 0;
  await page.route("**/api/auth/refresh", (route) => {
    refreshes++;
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/credits", (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto("/credits");
  await expect(page.getByRole("region", { name: "Your credits" }).getByRole("alert")).toContainText("could not authorize");
  expect(refreshes).toBe(0);
});

test("credit adapter requires authentication and same-origin provisioning", async ({ request }) => {
  const response = await request.get("/api/credits?userId=someone-else");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect((await request.post("/api/credits", { data: {} })).status()).toBe(403);
  expect((await request.post("/api/credits", {
    data: { userId: "someone-else", availableCredits: 99999 },
    headers: { Origin: "http://127.0.0.1:3100" },
  })).status()).toBe(401);
});

test("guests are prompted to log in and have no credit badge", async ({ page }) => {
  let creditCalls = 0;
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/credits", (route) => { creditCalls++; return route.fulfill({ json: {} }); });
  await page.goto("/credits");
  await expect(page.getByText("Log in to view your credit balance.")).toBeVisible();
  await expect(page.locator(".header-credits")).toHaveCount(0);
  expect(creditCalls).toBe(0);
});

test("signing out removes the balance from the header and credits page", async ({ page }) => {
  let signedIn = true;
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: signedIn ? 200 : 401,
    json: signedIn ? { id: "10000000-0000-4000-8000-000000000001", username: "CreditUser", isAdmin: false } : {},
  }));
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/credits", (route) => route.fulfill({ json: { availableCredits: 42, reservedCredits: 8 } }));
  await page.route("**/api/auth/logout", (route) => { signedIn = false; return route.fulfill({ json: {} }); });
  await page.goto("/credits");
  await expect(page.locator(".header-credits")).toHaveText("42");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.locator(".header-credits")).toHaveCount(0);
  await expect(page.getByText("Log in to view your credit balance.")).toBeVisible();
  await expect(page.locator(".credit-balance")).toHaveCount(0);
});
