import { test, expect, type Page } from "@playwright/test";
import type { CourierReview } from "../../src/services/contracts";

const requester = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "Requester",
  isAdmin: false,
};
const courier = {
  id: "10000000-0000-4000-8000-000000000002",
  username: "Courier",
  isAdmin: false,
};
const errandId = "30000000-0000-4000-8000-000000000001";
const errand = {
  id: errandId,
  requesterId: requester.id,
  courierId: courier.id,
  status: "COMPLETED",
  description: "Notebook delivery",
  pickupLocationLabel: "NUS Co-op@Central Library",
  deliveryDestination: "COM2",
  instructions: "Meet at the entrance",
  offeredCredits: 5,
  courierUsername: "Courier",
  version: 4,
  createdAt: "2026-11-01T01:00:00Z",
  updatedAt: "2026-11-01T02:00:00Z",
};
const savedReview: CourierReview = {
  id: "40000000-0000-4000-8000-000000000001",
  errandId,
  requesterId: requester.id,
  courierId: courier.id,
  stars: 5,
  comment: "Quick delivery!",
  createdAt: "2026-11-01T03:00:00Z",
};

async function setup(page: Page, user = requester, status = "COMPLETED") {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: user }),
  );
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
  );
  await page.route(`**/api/errands/${errandId}`, (route) =>
    route.fulfill({ json: { ...errand, status } }),
  );
}

test("requester submits once, summary refreshes, and saved review survives reload", async ({
  page,
}) => {
  await setup(page);
  let saved: CourierReview | null = null;
  let posts = 0;
  await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
    route.fulfill({
      json: {
        courierId: courier.id,
        averageStars: saved ? 5 : null,
        reviewCount: saved ? 1 : 0,
      },
    }),
  );
  await page.route(`**/api/errands/${errandId}/review`, async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { review: saved } });
    posts++;
    expect(route.request().postDataJSON()).toEqual({
      stars: 5,
      comment: "Quick delivery!",
    });
    saved = savedReview;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return route.fulfill({ json: saved });
  });
  await page.goto(`/errands/${errandId}`);
  await expect(page.getByText("No reviews yet", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "5 stars", exact: true }).check();
  await page.getByLabel("Comment (optional)").fill("  Quick delivery!  ");
  await page
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Submitting review…" }),
  ).toBeDisabled();
  await expect(page.getByText("Your review has been submitted.")).toBeVisible();
  await expect(
    page.getByText("5 / 5 · 1 review", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Quick delivery!", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit review", exact: true }),
  ).toHaveCount(0);
  expect(posts).toBe(1);
});

test("failed submission preserves inputs and allows an identical retry", async ({
  page,
}) => {
  await setup(page);
  let posts = 0;
  await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
    route.fulfill({
      json: { courierId: courier.id, averageStars: null, reviewCount: 0 },
    }),
  );
  await page.route(`**/api/errands/${errandId}/review`, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { review: null } });
    posts++;
    return posts === 1
      ? route.fulfill({
          status: 503,
          json: { message: "Please retry your review." },
        })
      : route.fulfill({ json: savedReview });
  });
  await page.goto(`/errands/${errandId}`);
  await page.getByRole("radio", { name: "5 stars", exact: true }).check();
  await page.getByLabel("Comment (optional)").fill("Quick delivery!");
  await page
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Courier reviews" }).getByRole("alert"),
  ).toHaveText("Please retry your review.");
  await expect(page.getByLabel("Comment (optional)")).toHaveValue(
    "Quick delivery!",
  );
  await expect(
    page.getByRole("radio", { name: "5 stars", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(page.getByText("Your review has been submitted.")).toBeVisible();
  expect(posts).toBe(2);
});

for (const scenario of [
  { name: "courier", user: courier, status: "COMPLETED" },
  { name: "requester before completion", user: requester, status: "DELIVERED" },
])
  test(`${scenario.name} sees ratings but cannot submit a review`, async ({
    page,
  }) => {
    await setup(page, scenario.user, scenario.status);
    let reviewReads = 0;
    await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
      route.fulfill({
        json: { courierId: courier.id, averageStars: 4.5, reviewCount: 2 },
      }),
    );
    await page.route(`**/api/errands/${errandId}/review`, (route) => {
      reviewReads++;
      return route.fulfill({ json: { review: null } });
    });
    await page.goto(`/errands/${errandId}`);
    await expect(
      page.getByText("4.5 / 5 · 2 reviews", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Review this delivery" }),
    ).toHaveCount(0);
    if (scenario.user.id === courier.id) {
      await expect(
        page.getByText("The requester has not reviewed this delivery yet."),
      ).toBeVisible();
      expect(reviewReads).toBe(1);
    } else expect(reviewReads).toBe(0);
  });

test("assigned courier reads the requester's stars and comment after reload without edit controls", async ({
  page,
}) => {
  await setup(page, courier);
  await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
    route.fulfill({
      json: { courierId: courier.id, averageStars: 4.5, reviewCount: 2 },
    }),
  );
  let posts = 0;
  await page.route(`**/api/errands/${errandId}/review`, (route) => {
    if (route.request().method() === "POST") posts++;
    return route.fulfill({ json: { review: savedReview } });
  });
  await page.goto(`/errands/${errandId}`);
  await expect(
    page.getByRole("heading", { name: "Requester’s review", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("5 / 5 stars", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Quick delivery!", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit review", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Quick delivery!", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(0);
});

test("courier sees an explicit empty comment and can retry a failed review read", async ({
  page,
}) => {
  await setup(page, courier);
  await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
    route.fulfill({
      json: { courierId: courier.id, averageStars: 5, reviewCount: 1 },
    }),
  );
  let reads = 0;
  await page.route(`**/api/errands/${errandId}/review`, (route) => {
    reads++;
    return reads === 1
      ? route.fulfill({ status: 503, json: { message: "Review unavailable." } })
      : route.fulfill({ json: { review: { ...savedReview, comment: null } } });
  });
  await page.goto(`/errands/${errandId}`);
  await expect(page.getByText("Review unavailable.")).toBeVisible();
  await page.getByRole("button", { name: "Retry review", exact: true }).click();
  await expect(page.getByText("No written comment provided.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit review", exact: true }),
  ).toHaveCount(0);
});

test("review loading failure offers retry instead of an unsafe blank form", async ({
  page,
}) => {
  await setup(page);
  let reads = 0;
  await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
    route.fulfill({
      json: { courierId: courier.id, averageStars: null, reviewCount: 0 },
    }),
  );
  await page.route(`**/api/errands/${errandId}/review`, (route) => {
    reads++;
    return reads === 1
      ? route.fulfill({
          status: 503,
          json: { message: "Cannot load your review." },
        })
      : route.fulfill({ json: { review: savedReview } });
  });
  await page.goto(`/errands/${errandId}`);
  await expect(page.getByText("Cannot load your review.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit review", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Retry review", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your review", exact: true }),
  ).toBeVisible();
});

test("conflicting duplicate submission reloads the existing review", async ({
  page,
}) => {
  await setup(page);
  let exists = false;
  await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
    route.fulfill({
      json: { courierId: courier.id, averageStars: 5, reviewCount: 1 },
    }),
  );
  await page.route(`**/api/errands/${errandId}/review`, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { review: exists ? savedReview : null } });
    exists = true;
    return route.fulfill({
      status: 409,
      json: { code: "REVIEW_ALREADY_EXISTS", message: "Already reviewed" },
    });
  });
  await page.goto(`/errands/${errandId}`);
  await page.getByRole("radio", { name: "3 stars", exact: true }).check();
  await page
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your review", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("5 / 5 stars", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit review", exact: true }),
  ).toHaveCount(0);
});

test("review adapters reject cross-origin writes and missing sessions", async ({
  request,
}) => {
  const url = `/api/errands/${errandId}/review`;
  expect(
    (
      await request.post(url, {
        headers: { Origin: "https://untrusted.example" },
        data: { stars: 5 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(url, {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { stars: 5 },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get(url)).status()).toBe(401);
  expect(
    (await request.get(`/api/couriers/${courier.id}/rating-summary`)).status(),
  ).toBe(401);
});
