import { expect, test, type Page } from "@playwright/test";
import type { Errand } from "../../src/services/contracts";

const admin = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "CampusAdmin",
  email: "admin@u.nus.edu",
  isAdmin: true,
  status: "ACTIVE",
};
const student = {
  ...admin,
  id: "10000000-0000-4000-8000-000000000002",
  username: "Student",
  isAdmin: false,
};
const requesterId = "10000000-0000-4000-8000-000000000003";
const courierId = "10000000-0000-4000-8000-000000000004";
const dispute: Errand = {
  id: "30000000-0000-4000-8000-000000000001",
  requesterId,
  requesterUsername: "Requester",
  courierId,
  courierUsername: "Courier",
  status: "DISPUTED",
  pickupLocationId: "20000000-0000-4000-8000-000000000001",
  pickupSupplierName: "Campus Coffee",
  pickupLocationLabel: "UTown · Level 1",
  description: "Lunch delivery dispute",
  deliveryDestination: "COM3 lobby",
  instructions: "Call on arrival",
  offeredCredits: 25,
  itemType: "FOOD",
  version: 4,
  createdAt: "2026-11-09T01:00:00Z",
  updatedAt: "2026-11-09T03:30:00Z",
  acceptedAt: "2026-11-09T01:10:00Z",
  pickedUpAt: "2026-11-09T02:00:00Z",
  deliveredAt: "2026-11-09T03:00:00Z",
  disputedAt: "2026-11-09T03:30:00Z",
  dispute: {
    status: "OPEN" as const,
    requesterStatement: "The parcel was left at the wrong lobby.",
    requesterId,
    requesterSubmittedAt: "2026-11-09T03:30:00Z",
    courierStatement: "I followed the destination shown in the request.",
    courierId,
    courierSubmittedAt: "2026-11-09T03:45:00Z",
    outcome: null,
    resolvedBy: null,
    resolvedAt: null,
  },
};

async function session(page: Page, user: typeof admin | null) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: user ? 200 : 401,
      json: user ?? { message: "Please log in." },
    }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { message: "Please log in." } }),
  );
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
  );
}

test("administrator reviews multiple disputed errands and refreshes new disputes", async ({ page }) => {
  await session(page, admin);
  await page.route("**/api/admin/suppliers**", (route) =>
    route.fulfill({ json: [] }),
  );
  let disputes = [
    dispute,
    {
      ...dispute,
      id: "30000000-0000-4000-8000-000000000002",
      description: "Printing pickup dispute",
      offeredCredits: 10,
    },
  ];
  let listCalls = 0;
  await page.route("**/api/admin/disputed-errands", (route) => {
    listCalls++;
    return route.fulfill({ json: disputes });
  });
  let detail: Errand = dispute;
  await page.route(`**/api/errands/${dispute.id}`, (route) => route.fulfill({ json: detail }));
  await page.route(`**/api/errands/${dispute.id}/resolve-dispute`, (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ outcome: "PAY_COURIER" });
    detail = {
      ...detail,
      status: "RESOLVED",
      dispute: {
        ...detail.dispute!,
        status: "RESOLVED",
        outcome: "PAY_COURIER",
        resolvedBy: admin.id,
        resolvedAt: "2026-11-09T04:00:00Z",
      },
    };
    return route.fulfill({ json: { operationId: "resolution", status: "SUCCEEDED", errand: detail } });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Disputed errands" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  const firstDispute = page
    .getByRole("article")
    .filter({ hasText: dispute.description });
  await expect(firstDispute).toContainText("Requester: Requester");
  await expect(firstDispute).toContainText("Courier: Courier");
  await expect(firstDispute).toContainText("UTown · Level 1");
  await expect(firstDispute).toContainText("COM3 lobby");
  await expect(firstDispute).toContainText("Offered credits: 25");
  await firstDispute.getByRole("button", { name: "View details" }).click();
  const details = page.getByLabel("Disputed errand details");
  await expect(details).toContainText(dispute.id);
  await expect(details).toContainText("Call on arrival");
  await expect(details).toContainText("Disputed");
  await expect(details).toContainText("2026");
  await expect(details).toContainText("The parcel was left at the wrong lobby.");
  await expect(details).toContainText("I followed the destination shown in the request.");
  await details.getByRole("button", { name: "Pay courier" }).click();
  await expect(details).toContainText("This decision cannot be changed");
  await details.getByRole("button", { name: "Confirm courier payment" }).click();
  await expect(page.getByRole("status")).toContainText("credits were paid to the courier");
  await expect(details).toContainText("Courier paid");

  disputes = [
    ...disputes,
    {
      ...dispute,
      id: "30000000-0000-4000-8000-000000000003",
      description: "Newly disputed errand",
    },
  ];
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Refresh disputes" }).click();
  await expect(page.getByText("Newly disputed errand")).toBeVisible();
  expect(listCalls).toBe(2);
});

test("disputed errands show empty and retryable error states", async ({ page }) => {
  await session(page, admin);
  await page.route("**/api/admin/suppliers**", (route) =>
    route.fulfill({ json: [] }),
  );
  let fail = true;
  await page.route("**/api/admin/disputed-errands", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { message: "Order service unavailable." } })
      : route.fulfill({ json: [] }),
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "Disputed errands" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Order service unavailable",
  );
  fail = false;
  await page.getByRole("button", { name: "Refresh disputes" }).click();
  await expect(page.getByText("No open disputes.")).toBeVisible();
});

test("administrator cannot resolve before the courier responds", async ({ page }) => {
  await session(page, admin);
  await page.route("**/api/admin/suppliers**", (route) =>
    route.fulfill({ json: [] }),
  );
  const awaitingResponse: Errand = {
    ...dispute,
    dispute: {
      ...dispute.dispute!,
      courierStatement: null,
      courierSubmittedAt: null,
    },
  };
  await page.route("**/api/admin/disputed-errands", (route) =>
    route.fulfill({ json: [awaitingResponse] }),
  );
  await page.route(`**/api/errands/${dispute.id}`, (route) =>
    route.fulfill({ json: awaitingResponse }),
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "Disputed errands" }).click();
  await page.getByRole("button", { name: "View details" }).click();
  const details = page.getByLabel("Disputed errand details");
  await expect(details).toContainText("Awaiting the courier's response");
  await expect(details.getByRole("button", { name: /refund requester|pay courier/i })).toHaveCount(0);
});

test("non-administrators cannot access the disputed errands dashboard tab", async ({ page }) => {
  await session(page, student);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Disputed errands" })).toHaveCount(0);
});
