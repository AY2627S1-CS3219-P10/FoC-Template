// AI-assisted: verify pickup label formatting and unchanged submission IDs.
import { test, expect } from "@playwright/test";
import { pickupSupplierDisplayName } from "../../src/features/suppliers/outlet-display";

test("shortens only location suffixes matching the pickup building", () => {
  const cases = [
    ["Printer @ Com 2", "Com 2", "Printer"],
    ["Starbucks @ UTown", "Education Resource Centre", "Starbucks"],
    ["Subway @ UTown", "Stephen Riady Centre", "Subway"],
    [
      "Wonderful Cafe @ CDE",
      "College of Design and Engineering",
      "Wonderful Cafe",
    ],
    ["Central Square @ YIH", "Yusof Ishak House", "Central Square"],
    ["Burnt Cones @ MD11", "Medicine Block MD11", "Burnt Cones"],
    ["Starbucks @ S9", "Science Block S9", "Starbucks"],
    ["Wonderful Cafe @ S16", "Science Block S16", "Wonderful Cafe"],
    ["NUS Co-op @ Science", "Science LT27", "NUS Co-op"],
    ["Cafe @  UNIVERSITY   HALL ", "University Hall", "Cafe"],
    ["Bread @ Heart", "Central Library", "Bread @ Heart"],
    ["Cafe @ constructor", "Central Library", "Cafe @ constructor"],
    ["Starbucks @ UTown", "University Hall", "Starbucks @ UTown"],
    ["A Hot Hideout", "Prince George's Park", "A Hot Hideout"],
  ];
  for (const [name, building, expected] of cases) {
    expect(pickupSupplierDisplayName(name, building)).toBe(expected);
  }
});

test("pickup labels keep distinct outlets and submit the original location ID", async ({
  page,
}) => {
  const locations = [
    {
      id: "10000000-0000-4000-8000-000000000002",
      name: "Starbucks @ UTown",
      building: "Education Resource Centre",
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      name: "Starbucks @ University Hall",
      building: "University Hall",
    },
    {
      id: "10000000-0000-4000-8000-000000000004",
      name: "Bread @ Heart",
      building: "Central Library",
    },
  ];
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: { id: "user", username: "TestUser", isAdmin: false },
    }),
  );
  await page.route("**/api/credits", (route) =>
    route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }),
  );
  await page.route("**/api/suppliers", (route) =>
    route.fulfill({
      json: locations.map((location) => ({
        id: location.id,
        name: location.name,
        locations: [
          { ...location, supplierAtLocation: location.name, floor: null },
        ],
      })),
    }),
  );
  await page.route("**/api/errands", (route) =>
    route.fulfill({
      status: 202,
      json: { status: "PENDING", operationId: "operation" },
    }),
  );
  await page.goto("/errands/create");

  const select = page.getByRole("combobox", { name: "Pickup location" });
  await expect(select.locator("option")).toHaveText([
    "Select a pickup location",
    "Starbucks · Education Resource Centre · Floor unknown",
    "Starbucks · University Hall · Floor unknown",
    "Bread @ Heart · Central Library · Floor unknown",
  ]);
  await select.selectOption(locations[1].id);
  await page.getByLabel("Errand description").fill("Coffee");
  await page.getByLabel("Delivery destination").fill("UTown");
  await page.getByLabel("Pickup or delivery instructions").fill("Call me");
  const request = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/errands") && request.method() === "POST",
  );
  await page
    .locator("form")
    .getByRole("button", { name: "Create errand", exact: true })
    .click();
  expect((await request).postDataJSON().pickupLocationId).toBe(locations[1].id);
});
