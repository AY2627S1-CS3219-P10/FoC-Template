// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import { expect, test } from "@playwright/test";

const cafe = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Campus Cafe",
  category: "FOOD_COFFEE",
  categories: ["FOOD", "BEVERAGES"],
  locations: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      building: "UTown",
      floor: 1,
      locationDescription: "Entrance",
      latitude: 1.3,
      longitude: 103.7,
      opensAt: "08:00",
      closesAt: "20:00",
      isOpenOvernight: false,
      imageUrl: null,
      supplierAtLocation: "Campus Cafe@UTown",
    },
  ],
};
const food = {
  ...cafe,
  id: "20000000-0000-4000-8000-000000000002",
  name: "Food Stall",
  category: "FOOD",
  categories: ["FOOD"],
};
const drinks = {
  ...cafe,
  id: "20000000-0000-4000-8000-000000000003",
  name: "Drinks Stall",
  categories: ["BEVERAGES"],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        id: "10000000-0000-4000-8000-000000000001",
        username: "Admin",
        email: "admin@u.nus.edu",
        isAdmin: true,
        status: "ACTIVE",
      },
    }),
  );
});

test("food and beverages filter independently in list, cards and details", async ({
  page,
}) => {
  await page.route("**/api/suppliers", (route) =>
    route.fulfill({ json: [cafe, food, drinks] }),
  );
  await page.goto("/suppliers");
  await expect(page.getByRole("button", { name: "Food & coffee" })).toHaveCount(
    0,
  );
  for (const view of ["List", "Cards"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await page.getByRole("button", { name: "Food", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Campus Cafe", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Food Stall", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Drinks Stall", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Beverages", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Campus Cafe", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Drinks Stall", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Food Stall", exact: true }),
    ).toHaveCount(0);
  }
  const cafeCard = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Campus Cafe", exact: true }),
    });
  await expect(cafeCard.locator(".supplier-tags")).toContainText("Food");
  await expect(cafeCard.locator(".supplier-tags")).toContainText("Beverages");
  await page.getByRole("link", { name: "Campus Cafe", exact: true }).click();
  await expect(page.locator(".detail-page .supplier-tags")).toHaveText(
    "FoodBeverages",
  );
});

test("admin preserves drinks-only tags, prevents empty selections and can select both", async ({
  page,
}) => {
  let catalog = [structuredClone(drinks)];
  const writes: { name: string; categories: string[] }[] = [];
  await page.route("**/api/admin/suppliers**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: route.request().url().endsWith("campus-locations") ? [] : catalog,
      });
    const body = route.request().postDataJSON();
    writes.push(body);
    catalog = [{ ...catalog[0], ...body }];
    return route.fulfill({ json: catalog[0] });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await expect(page.getByText("No suppliers found.")).toBeVisible();
  await page.getByRole("button", { name: "Beverages", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Drinks Stall", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit supplier", exact: true })
    .click();
  const foodCheckbox = page.getByRole("checkbox", {
    name: "Food",
    exact: true,
  });
  const beveragesCheckbox = page.getByRole("checkbox", {
    name: "Beverages",
    exact: true,
  });
  await expect(foodCheckbox).not.toBeChecked();
  await expect(beveragesCheckbox).toBeChecked();
  await page.getByLabel("Supplier name").fill("Renamed Drinks");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed Drinks", exact: true }),
  ).toBeVisible();
  expect(writes[0]).toEqual({
    name: "Renamed Drinks",
    categories: ["BEVERAGES"],
  });

  await page
    .getByRole("button", { name: "Edit supplier", exact: true })
    .click();
  await beveragesCheckbox.uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Select at least one category",
  );
  expect(writes).toHaveLength(1);
  await foodCheckbox.check();
  await beveragesCheckbox.check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed Drinks", exact: true }),
  ).toBeVisible();
  expect(writes[1]).toEqual({
    name: "Renamed Drinks",
    categories: ["FOOD", "BEVERAGES"],
  });
});
