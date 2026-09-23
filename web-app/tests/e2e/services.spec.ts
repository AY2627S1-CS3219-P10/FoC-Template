import { expect, test } from "@playwright/test";

test("guest flow links to real account and supplier screens", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore suppliers" }).click();
  await expect(
    page.getByRole("heading", { name: "Log in to explore suppliers." }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Log in", exact: true })
    .click();
  await expect(page.getByLabel("NUS email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByText("Demo preview")).toHaveCount(0);
});

test("registration and verification expose the backend's required fields", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Phone number")).toBeVisible();
  await page.goto("/verify-email");
  await expect(page.getByLabel("Verification code")).toHaveAttribute(
    "pattern",
    "[0-9]{6}",
  );
  await page.getByRole("button", { name: "Resend verification code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Enter your NUS email address first",
  );
});

test("API adapter rejects unauthenticated and cross-origin requests", async ({
  request,
  baseURL,
}) => {
  const suppliers = await request.get("/api/suppliers");
  expect(suppliers.status()).toBe(401);
  expect(suppliers.headers()["cache-control"]).toBe("no-store");
  const crossOrigin = await request.post("/api/auth/login", {
    headers: { Origin: "https://untrusted.example" },
    data: { email: "", password: "" },
  });
  expect(crossOrigin.status()).toBe(403);
  const invalid = await request.post("/api/auth/login", {
    headers: { Origin: baseURL! },
    data: {},
  });
  expect(invalid.status()).toBe(400);
  const refresh = await request.post("/api/auth/refresh", {
    headers: { Origin: baseURL! },
    data: {},
  });
  expect(refresh.status()).toBe(401);
});

test("live services: login, profile, token renewal, supplier catalog, and logout", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Requires running User and Supplier Services and a verified account in E2E_USER_EMAIL/E2E_USER_PASSWORD.",
  );
  await page.goto("/login");
  await page.getByLabel("NUS email").fill(process.env.E2E_USER_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/suppliers$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your campus.",
  );
  const cookies = await context.cookies();
  expect(
    cookies
      .filter((cookie) => cookie.name.startsWith("foc_"))
      .every((cookie) => cookie.httpOnly),
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === "foc_refresh")).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("foc_");
  await context.clearCookies({ name: "foc_access" });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your campus.",
  );
  expect(
    (await context.cookies()).some((cookie) => cookie.name === "foc_access"),
  ).toBe(true);
  await page
    .getByRole("searchbox", { name: "Search suppliers" })
    .fill("no-match-" + crypto.randomUUID());
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("searchbox").fill("");
  const cards = page.getByRole("link", { name: /^View locations:/ });
  if (await cards.count()) {
    await cards.first().click();
    await expect(
      page.getByText("Available pickup locations", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View pickup location on map" }).first(),
    ).toHaveAttribute("href", /^https:\/\/www.google.com\/maps\/search/);
  }
  await page.getByRole("link", { name: "Your account", exact: true }).click();
  await expect(
    page
      .getByRole("definition")
      .filter({ hasText: process.env.E2E_USER_EMAIL! }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByText("Log in to view your profile.")).toBeVisible();
  expect(
    (await context.cookies()).filter((cookie) =>
      cookie.name.startsWith("foc_"),
    ),
  ).toHaveLength(0);
});
