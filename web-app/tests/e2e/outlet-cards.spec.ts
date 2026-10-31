import { expect, test } from "@playwright/test";

const supplierId = "20000000-0000-4000-8000-000000000001";
const locationId = "30000000-0000-4000-8000-000000000001";
const supplier = {
  id: supplierId,
  name: "MedSci Printing",
  category: "PRINTING",
  locations: [
    {
      id: locationId,
      building: "Medicine+Science Library",
      floor: 1,
      locationDescription: "Near Level 1 entrance",
      latitude: 1.3,
      longitude: 103.7,
      opensAt: "09:00",
      closesAt: "18:00",
      isOpenOvernight: false,
      imageUrl: null,
      supplierAtLocation: "MedSci Printing@Medicine+Science Library",
    },
  ],
};
const secondOutlet = {
  ...supplier.locations[0],
  id: "30000000-0000-4000-8000-000000000002",
  floor: 2,
  locationDescription: "Near Level 2 entrance",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        id: "10000000-0000-4000-8000-000000000001",
        username: "CampusAdmin",
        email: "admin@u.nus.edu",
        isAdmin: true,
        status: "ACTIVE",
      },
    }),
  );
});

test("guests can preview suppliers but must log in to view locations", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.goto("/suppliers");
  await expect(
    page.getByText("Preview popular suppliers around campus."),
  ).toBeVisible();
  await expect(page.getByText("Anna's x Soup Union")).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Log in to view locations: Anna's x Soup Union",
    }),
  ).toHaveAttribute("href", "/login");
});

test("adding the same name on another floor automatically renders a separate admin card", async ({
  page,
}) => {
  const catalog = structuredClone(supplier);
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/suppliers**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: route.request().url().endsWith("/campus-locations")
          ? [
              {
                id: locationId,
                building: "Medicine+Science Library",
                latitude: 1.3,
                longitude: 103.7,
              },
            ]
          : [catalog],
      });
    }
    writes.push(route.request().postDataJSON());
    catalog.locations.push(secondOutlet);
    return route.fulfill({ status: 201, json: catalog });
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", {
      name: "MedSci Printing",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  await page.getByLabel("Supplier name").fill("MedSci Printing");
  await page
    .getByRole("combobox", { name: "Category" })
    .selectOption("PRINTING");
  await page
    .getByRole("combobox", { name: "Building" })
    .selectOption(locationId);
  await page.getByLabel("Floor", { exact: true }).fill("2");
  await page.getByLabel("Location description").fill("Near Level 2 entrance");
  await page.getByLabel("Opening time").fill("09:00");
  await page.getByLabel("Closing time").fill("18:00");
  await page
    .getByRole("button", { name: "Create supplier", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(
    page.getByRole("heading", {
      name: "MedSci Printing — Level 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "MedSci Printing — Level 2",
      exact: true,
    }),
  ).toBeVisible();
  expect(writes[0]).toMatchObject({
    name: "MedSci Printing",
    location: { floor: 2 },
  });
  const level2Card = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "MedSci Printing — Level 2",
      exact: true,
    }),
  });
  await expect(
    level2Card.getByRole("button", {
      name: "Delete supplier (all outlets)",
      exact: true,
    }),
  ).toBeVisible();
  await level2Card
    .getByRole("button", { name: "Edit pickup location" })
    .click();
  await expect(page.getByLabel("Floor", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Filter suppliers" })
    .fill("Floor 1");
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("supplier browsing distinguishes floors and links to the selected outlet", async ({
  page,
}) => {
  await page.route("**/api/suppliers", (route) =>
    route.fulfill({
      json: [{ ...supplier, locations: [...supplier.locations, secondOutlet] }],
    }),
  );
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Cards" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(
    page.getByRole("article").first().getByText("Campus locations"),
  ).toBeVisible();
  await expect(
    page.getByRole("article").first().getByText("Pickup points"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "MedSci Printing — Level 1", exact: true }),
  ).toBeVisible();
  const floor2Link = page.getByRole("link", {
    name: "MedSci Printing — Level 2",
    exact: true,
  });
  await expect(floor2Link).toHaveAttribute(
    "href",
    `/suppliers/${supplierId}#outlet-${secondOutlet.id}`,
  );
  await page
    .getByRole("searchbox", { name: "Search suppliers" })
    .fill("Floor 2");
  await expect(page.getByRole("article")).toHaveCount(1);
  await floor2Link.click();
  await expect(page.locator(`#outlet-${secondOutlet.id}`)).toContainText(
    "Floor 2",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("supplier browsing switches between card and list layouts and remembers the choice", async ({
  page,
}) => {
  await page.route("**/api/suppliers", (route) =>
    route.fulfill({ json: [supplier] }),
  );
  await page.goto("/suppliers");
  await expect(page.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("table")).toBeVisible();

  await page.getByRole("button", { name: "Cards" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("table")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Cards" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article")).toHaveCount(1);
});

for (const path of ["/admin", "/suppliers"]) {
  test(`ordinary suppliers stay grouped without floor suffixes on ${path}`, async ({
    page,
  }) => {
    const catalog = [
      supplier,
      {
        ...supplier,
        id: "20000000-0000-4000-8000-000000000002",
        name: "Starbucks",
        category: "FOOD_COFFEE",
        locations: [
          {
            ...supplier.locations[0],
            id: "40000000-0000-4000-8000-000000000001",
            building: "UTown",
            floor: 1,
          },
          {
            ...supplier.locations[0],
            id: "40000000-0000-4000-8000-000000000002",
            building: "Science",
            floor: 2,
          },
        ],
      },
      {
        ...supplier,
        id: "20000000-0000-4000-8000-000000000003",
        name: "Another Printing Business",
        locations: [secondOutlet],
      },
      {
        ...supplier,
        id: "20000000-0000-4000-8000-000000000004",
        name: "Unknown Floor Shop",
        locations: [
          {
            ...supplier.locations[0],
            id: "40000000-0000-4000-8000-000000000003",
            floor: null,
          },
        ],
      },
    ];
    await page.route("**/api/admin/suppliers**", (route) =>
      route.fulfill({
        json: route.request().url().endsWith("/campus-locations")
          ? []
          : catalog,
      }),
    );
    await page.route("**/api/suppliers", (route) =>
      route.fulfill({ json: catalog }),
    );
    await page.goto(path);
    if (path === "/suppliers")
      await page.getByRole("button", { name: "Cards" }).click();
    await expect(page.getByRole("article")).toHaveCount(4);
    for (const name of [
      "MedSci Printing",
      "Starbucks",
      "Another Printing Business",
      "Unknown Floor Shop",
    ]) {
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: /— Level/ })).toHaveCount(0);
    const starbucks = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Starbucks", exact: true }),
    });
    await expect(starbucks).toContainText("UTown");
    await expect(starbucks).toContainText("Science");
  });
}
