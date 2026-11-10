import { expect, test } from "@playwright/test";

const requester = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "Requester",
  email: "requester@u.nus.edu",
  isAdmin: false,
};
const courier = {
  id: "10000000-0000-4000-8000-000000000002",
  username: "Courier",
  email: "courier@u.nus.edu",
  isAdmin: false,
};
const administrator = {
  id: "10000000-0000-4000-8000-000000000003",
  username: "Moderator",
  email: "moderator@u.nus.edu",
  isAdmin: true,
};
const errand = {
  id: "30000000-0000-4000-8000-000000000001",
  requesterId: requester.id,
  requesterUsername: requester.username,
  courierId: courier.id,
  courierUsername: courier.username,
  status: "ACCEPTED",
  description: "Lunch delivery",
  pickupLocationLabel: "Cafe@Library",
  deliveryDestination: "UTown",
  instructions: "Meet downstairs",
  offeredCredits: 20,
  version: 1,
  createdAt: "2026-10-18T01:00:00Z",
  updatedAt: "2026-10-18T01:10:00Z",
};
const report = {
  id: "40000000-0000-4000-8000-000000000001",
  reporterUserId: requester.id,
  reportedUserId: courier.id,
  reporter: { id: requester.id, username: requester.username },
  reportedUser: { id: courier.id, username: courier.username },
  description: "The courier did not arrive at the agreed location.",
  status: "OPEN" as const,
  createdAt: "2026-11-01T02:00:00Z",
  updatedAt: "2026-11-01T02:00:00Z",
  resolvedAt: null,
  resolvedBy: null,
};

test("an errand participant reports only the other participant once", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: requester }));
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
  );
  await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
    route.fulfill({ json: { averageStars: null, reviewCount: 0 } }),
  );
  await page.route(`**/api/errands/${errand.id}`, (route) => route.fulfill({ json: errand }));
  let submissions = 0;
  await page.route("**/api/reports", async (route) => {
    submissions++;
    expect(route.request().postDataJSON()).toEqual({
      reportedUserId: courier.id,
      description: "Unsafe handoff behaviour",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return route.fulfill({ status: 201, json: report });
  });

  await page.goto(`/errands/${errand.id}`);
  await expect(page.getByRole("button", { name: "Report requester" })).toHaveCount(0);
  await page.getByRole("button", { name: "Report courier" }).click();
  await expect(page.getByRole("heading", { name: "Report Courier" })).toBeVisible();
  await page.getByLabel("What happened?").fill("   ");
  await page.getByRole("button", { name: "Submit report about Courier" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("1 to 500 characters");
  expect(submissions).toBe(0);
  await page.getByLabel("What happened?").fill("Unsafe handoff behaviour");
  await page.getByRole("button", { name: "Submit report about Courier" }).dblclick();
  await expect(page.getByRole("status")).toContainText("report about Courier was submitted");
  expect(submissions).toBe(1);
});

test("a courier can select the requester but never themselves", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: courier }));
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
  );
  await page.route(`**/api/errands/${errand.id}`, (route) => route.fulfill({ json: errand }));
  await page.goto(`/errands/${errand.id}`);
  await expect(page.getByRole("button", { name: "Report requester" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report courier" })).toHaveCount(0);
});

test("administrator filters, views, suspends and explicitly resolves a report", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: administrator }));
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
  );
  await page.route("**/api/admin/suppliers**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/reports?*", (route) => {
    const filter = new URL(route.request().url()).searchParams.get("status");
    return route.fulfill({ json: filter === "OPEN" ? [report] : [] });
  });
  await page.route(`**/api/admin/reports/${report.id}`, (route) =>
    route.fulfill({ json: report }),
  );
  const suspensionBodies: Array<{ suspendedUntil: string }> = [];
  await page.route(`**/api/admin/accounts/${courier.id}/suspension`, (route) => {
    const suspensionBody: { suspendedUntil: string } = route.request().postDataJSON();
    suspensionBodies.push(suspensionBody);
    return route.fulfill({
      json: {
        id: courier.id,
        username: courier.username,
        status: "SUSPENDED",
        suspendedUntil: suspensionBody.suspendedUntil,
      },
    });
  });
  await page.route(`**/api/admin/reports/${report.id}/resolve`, (route) =>
    route.fulfill({
      json: {
        ...report,
        status: "RESOLVED",
        resolvedAt: "2026-11-01T03:00:00Z",
        resolvedBy: { id: administrator.id, username: administrator.username },
      },
    }),
  );

  await page.goto("/admin");
  await page.getByRole("button", { name: "Reports & moderation" }).click();
  await expect(page.getByText("Reported by Requester")).toBeVisible();
  await page.getByRole("button", { name: "Resolved" }).click();
  await expect(page.getByText("No resolved reports.")).toBeVisible();
  await page.getByRole("button", { name: "Open" }).click();
  await page.getByRole("button", { name: "View report" }).click();
  await expect(page.getByLabel("Report details")).toContainText(report.description);
  await page.getByRole("button", { name: "Suspend user" }).click();
  for (const days of [1, 3, 7, 30]) {
    const before = Date.now();
    await page.getByLabel("Suspension duration").selectOption(String(days));
    await page.getByRole("button", { name: "Confirm suspension of Courier" }).dblclick();
    await expect(page.getByRole("status")).toContainText("report remains open");
    const delta = new Date(suspensionBodies.at(-1)!.suspendedUntil).getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(days * 24 * 60 * 60 * 1000 - 5_000);
    expect(delta).toBeLessThanOrEqual(days * 24 * 60 * 60 * 1000 + 5_000);
    expect(suspensionBodies).toHaveLength(days === 1 ? 1 : days === 3 ? 2 : days === 7 ? 3 : 4);
    if (days !== 30)
      await page.getByRole("button", { name: "Suspend user" }).click();
  }
  await expect(page.getByLabel("Report details")).toContainText("OPEN REPORT");
  await page.getByRole("button", { name: "Mark report resolved" }).click();
  await expect(page.getByRole("status")).toContainText("marked resolved");
});

test("custom suspension rejects past dates and propagates backend conflicts", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: administrator }));
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
  );
  await page.route("**/api/admin/suppliers**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/reports?*", (route) => route.fulfill({ json: [report] }));
  await page.route(`**/api/admin/reports/${report.id}`, (route) => route.fulfill({ json: report }));
  let attempts = 0;
  await page.route(`**/api/admin/accounts/${courier.id}/suspension`, (route) => {
    attempts++;
    return route.fulfill({
      status: 409,
      json: { code: "ACCOUNT_NOT_SUSPENDABLE", message: "This account is already suspended." },
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Reports & moderation" }).click();
  await page.getByRole("button", { name: "View report" }).click();
  await page.getByRole("button", { name: "Suspend user" }).click();
  await page.getByLabel("Suspension duration").selectOption("custom");
  await page.getByLabel("Custom expiry date and time").fill("2020-01-01T00:00");
  await page.getByRole("button", { name: "Confirm suspension of Courier" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("valid suspension expiry");
  expect(attempts).toBe(0);
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Custom expiry date and time").fill(local);
  await page.getByRole("button", { name: "Confirm suspension of Courier" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("already suspended");
  expect(attempts).toBe(1);
});

test("suspended login explains the restriction with and without an expiry", async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 401, json: { message: "Please log in." } }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { message: "Please log in." } }),
  );
  let includeExpiry = true;
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 403,
      json: {
        code: "ACCOUNT_TEMPORARILY_SUSPENDED",
        message: "Your account is temporarily suspended.",
        ...(includeExpiry ? { suspendedUntil: "2026-11-04T02:00:00Z" } : {}),
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("NUS email").fill("student@u.nus.edu");
  await page.getByLabel("Password", { exact: true }).fill("Strong!Pass");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily suspended");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("2026");
  includeExpiry = false;
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Your account is temporarily suspended.");
});

test("moderation adapters enforce authentication, origin and allowlisted paths", async ({ request, baseURL }) => {
  expect((await request.get("/api/admin/reports?status=OPEN")).status()).toBe(401);
  expect(
    (
      await request.post("/api/reports", {
        headers: { Origin: "https://untrusted.example" },
        data: { reportedUserId: courier.id, description: "Issue" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/reports", {
        headers: { Origin: baseURL! },
        data: { reportedUserId: courier.id, description: "" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch(`/api/admin/accounts/${courier.id}/suspension`, {
        headers: { Origin: baseURL! },
        data: { suspendedUntil: "2026-12-01T00:00:00Z" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get("/api/admin/reports/not-a-uuid")).status()).toBe(404);
});
