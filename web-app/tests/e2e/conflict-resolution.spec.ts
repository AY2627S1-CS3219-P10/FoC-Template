import { expect, test, type Page } from "@playwright/test";
import type { Errand } from "../../src/services/contracts";

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
const base: Errand = {
  id: "30000000-0000-4000-8000-000000000001",
  requesterId: requester.id,
  requesterUsername: requester.username,
  courierId: courier.id,
  courierUsername: courier.username,
  status: "DELIVERED",
  pickupLocationId: "20000000-0000-4000-8000-000000000001",
  pickupSupplierName: "Campus Cafe",
  pickupLocationLabel: "Central Library",
  description: "Deliver notes",
  deliveryDestination: "COM3",
  instructions: "Call on arrival",
  offeredCredits: 20,
  version: 3,
  createdAt: "2026-11-10T01:00:00Z",
  updatedAt: "2026-11-10T02:00:00Z",
  deliveredAt: "2026-11-10T02:00:00Z",
};

async function common(page: Page, user: typeof requester) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: user }));
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 80, reservedCredits: 20 } }),
  );
  await page.route(`**/api/couriers/${courier.id}/rating-summary`, (route) =>
    route.fulfill({ json: { averageStars: null, reviewCount: 0 } }),
  );
}

test("requester explains and confirms a dispute exactly once", async ({ page }) => {
  await common(page, requester);
  let value = base;
  let submissions = 0;
  await page.route(`**/api/errands/${base.id}`, (route) =>
    route.fulfill({ json: value }),
  );
  await page.route(`**/api/errands/${base.id}/dispute`, async (route) => {
    submissions++;
    expect(route.request().postDataJSON()).toEqual({
      explanation: "The notes never reached me.",
    });
    value = {
      ...value,
      status: "DISPUTED",
      disputedAt: "2026-11-10T03:00:00Z",
      dispute: {
        status: "OPEN",
        requesterStatement: "The notes never reached me.",
        requesterId: requester.id,
        requesterSubmittedAt: "2026-11-10T03:00:00Z",
        courierStatement: null,
        courierId: courier.id,
        courierSubmittedAt: null,
        outcome: null,
        resolvedBy: null,
        resolvedAt: null,
      },
    };
    await new Promise((done) => setTimeout(done, 100));
    return route.fulfill({ json: value });
  });
  await page.goto(`/errands/${base.id}`);
  await page.getByRole("button", { name: "Dispute errand" }).click();
  await page.getByLabel("Why are you disputing this delivery?").fill("   ");
  await page.getByRole("button", { name: "Review dispute" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "1 to 2000 characters",
  );
  await page.getByLabel("Why are you disputing this delivery?").fill(
    "The notes never reached me.",
  );
  await page.getByRole("button", { name: "Review dispute" }).click();
  expect(submissions).toBe(0);
  await expect(page.getByRole("heading", { name: "Confirm dispute" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm and submit dispute" }).dblclick();
  await expect(page.getByLabel("Status: Disputed")).toBeVisible();
  await expect(page.getByText("The notes never reached me.")).toBeVisible();
  expect(submissions).toBe(1);
});

test("assigned courier sees the explanation and finalizes one response", async ({ page }) => {
  await common(page, courier);
  let value: Errand = {
    ...base,
    status: "DISPUTED",
    disputedAt: "2026-11-10T03:00:00Z",
    dispute: {
      status: "OPEN",
      requesterStatement: "The notes never reached me.",
      requesterId: requester.id,
      requesterSubmittedAt: "2026-11-10T03:00:00Z",
      courierStatement: null,
      courierId: courier.id,
      courierSubmittedAt: null,
      outcome: null,
      resolvedBy: null,
      resolvedAt: null,
    },
  };
  let submissions = 0;
  await page.route(`**/api/errands/${base.id}`, (route) =>
    route.fulfill({ json: value }),
  );
  await page.route(`**/api/errands/${base.id}/respond-dispute`, (route) => {
    submissions++;
    expect(route.request().postDataJSON()).toEqual({
      response: "I handed the notes to the requester.",
    });
    value = {
      ...value,
      dispute: {
        ...value.dispute!,
        courierStatement: "I handed the notes to the requester.",
        courierSubmittedAt: "2026-11-10T03:30:00Z",
      },
    };
    return route.fulfill({ json: value });
  });
  await page.goto(`/errands/${base.id}`);
  await expect(page.getByText("The notes never reached me.")).toBeVisible();
  await page.getByLabel("Your Response").fill(
    "I handed the notes to the requester.",
  );
  await page.getByRole("button", { name: "Submit final response" }).dblclick();
  await expect(page.getByText("I handed the notes to the requester.")).toBeVisible();
  expect(submissions).toBe(1);
  await page.reload();
  await expect(page.getByLabel("Your Response")).toHaveCount(0);
  await expect(page.getByText("I handed the notes to the requester.")).toBeVisible();
});
