import { test, expect } from "@playwright/test";

// This journey uses real services and configured credentials, with no interception.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("a logged-in user sees their authoritative credit balance", async ({ page }) => {
  test.skip(!process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Requires real User/Credit Services and a verified E2E_USER_EMAIL/E2E_USER_PASSWORD account.");
  test.setTimeout(60_000);
  const creditOrigin = process.env.CREDIT_SERVICE_URL || "http://127.0.0.1:3003";
  await expect.poll(async () => {
    try { return (await page.request.get(`${creditOrigin}/health/ready`, { timeout: 2000 })).ok(); }
    catch { return false; }
  }, { timeout: 30_000, message: "Credit Service must be ready before live login" }).toBe(true);
  await page.goto("/login");
  await page.getByLabel("NUS email").fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  const login = await loginResponse;
  if (!login.ok()) {
    // Failed-login snapshots must not retain credentials typed into the form.
    await page.getByLabel("Password", { exact: true }).fill("");
    await page.getByLabel("NUS email").fill("");
    throw new Error(`Live login failed with HTTP ${login.status()}`);
  }
  const badge = page.getByRole("link", { name: /^Credits: \d.*available\. View credits$/ });
  await expect(badge).toBeVisible();
  try {
    await badge.click();
    await expect(page).toHaveURL(/\/credits$/);
    const credits = page.getByRole("region", { name: "Your credits" });
    await expect(credits.locator("dd")).toHaveCount(2);
    const response = await page.request.get("/api/credits");
    expect(response.status()).toBe(200);
    const balance = await response.json();
    expect(Number.isInteger(balance.availableCredits)).toBe(true);
    expect(Number.isInteger(balance.reservedCredits)).toBe(true);
    await expect(badge).toHaveText(balance.availableCredits.toLocaleString());
    await expect(credits.locator("dd")).toHaveText([
      balance.availableCredits.toLocaleString(), balance.reservedCredits.toLocaleString(),
    ]);
    await credits.getByRole("button", { name: "Refresh credits" }).click();
    await expect(credits.locator("dd")).toHaveText([
      balance.availableCredits.toLocaleString(), balance.reservedCredits.toLocaleString(),
    ]);
  } finally {
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page.getByRole("link", { name: "Log in", exact: true }).first()).toBeVisible();
  }
});
