/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of my courier rating test cases.
 * Author review: Validated the assertions and setup for "guests do not see personal reviews or request the overview" against the browser actions and mocked responses; clarified test descriptions and assertion formatting.
 */

import { test, expect } from "@playwright/test";

const user = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "Student",
  isAdmin: false,
};
const overview = {
  courierId: user.id,
  averageStars: 4.5,
  reviewCount: 8,
  recentComments: [
    {
      id: "newest",
      stars: 5,
      comment: "Friendly and punctual!",
      createdAt: "2026-11-01T12:00:00Z",
    },
    {
      id: "second",
      stars: 4,
      comment: "Kept me updated.",
      createdAt: "2026-10-30T12:00:00Z",
    },
    {
      id: "third",
      stars: 5,
      comment: "Careful with my order.",
      createdAt: "2026-10-29T12:00:00Z",
    },
  ],
};

for (const isAdmin of [false, true])
  test(`logged-in ${isAdmin ? "administrator" : "student"} sees personal average and recent comments`, async ({
    page,
  }, testInfo) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: { ...user, isAdmin } }),
    );
    await page.route("**/api/credits", (route) =>
      route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
    );
    await page.route("**/api/couriers/me/review-overview", (route) =>
      route.fulfill({ json: overview }),
    );
    await page.goto("/");
    const panel = page.getByRole("region", {
      name: "Your courier rating",
      exact: true,
    });
    await expect(panel).toBeVisible();
    await expect(panel.locator(".home-rating-score")).toContainText("4.5");
    await expect(
      panel.getByText("Based on 8 reviews", { exact: true }),
    ).toBeVisible();
    await expect(panel.locator("blockquote")).toHaveText(
      overview.recentComments.map((value) => value.comment),
    );
    await expect(panel.getByRole("listitem")).toHaveCount(3);
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    if (!isAdmin) await panel.screenshot({ path: testInfo.outputPath("home-rating-panel.png") });
  });

test("guests do not see personal reviews or request the overview", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 401, json: { message: "Please log in" } }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { message: "Please log in" } }),
  );
  let calls = 0;
  await page.route("**/api/couriers/me/review-overview", (route) => {
    calls++;
    return route.fulfill({ json: overview });
  });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Log in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your courier rating", exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(0);
});

for (const hasRating of [false, true])
  test(`handles ${hasRating ? "star-only ratings" : "no received reviews"}`, async ({
    page,
  }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: user }),
    );
    await page.route("**/api/credits", (route) =>
      route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
    );
    await page.route("**/api/couriers/me/review-overview", (route) =>
      route.fulfill({
        json: {
          courierId: user.id,
          averageStars: hasRating ? 4 : null,
          reviewCount: hasRating ? 1 : 0,
          recentComments: [],
        },
      }),
    );
    await page.goto("/");
    await expect(
      page.getByText(
        hasRating
          ? "You have ratings, but no written comments yet."
          : "No ratings yet",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Your courier rating", exact: true })
        .locator("blockquote"),
    ).toHaveCount(0);
  });

test("overview failure can be retried without hiding the home page", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: user }),
  );
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
  );
  let calls = 0;
  await page.route("**/api/couriers/me/review-overview", (route) => {
    calls++;
    return calls === 1
      ? route.fulfill({
          status: 503,
          json: { message: "Reviews unavailable." },
        })
      : route.fulfill({ json: overview });
  });
  await page.goto("/");
  await expect(
    page.getByText("Reviews unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browse errands", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry your reviews", exact: true })
    .click();
  await expect(
    page.getByText("Friendly and punctual!", { exact: true }),
  ).toBeVisible();
});

test("overview adapter requires a session", async ({ request }) => {
  expect((await request.get("/api/couriers/me/review-overview")).status()).toBe(
    401,
  );
});
