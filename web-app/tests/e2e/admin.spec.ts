import { expect, test, type Page } from "@playwright/test";

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
  email: "student@u.nus.edu",
  isAdmin: false,
};
const supplier = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Campus Coffee",
  category: "FOOD_COFFEE",
  locations: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      building: "UTown",
      floor: 1,
      locationDescription: "Main entrance",
      latitude: 1.3,
      longitude: 103.7,
      opensAt: "08:00",
      closesAt: "20:00",
      isOpenOvernight: false,
      imageUrl: null,
      supplierAtLocation: "Campus Coffee@UTown",
    },
  ],
};

async function session(page: Page, user: typeof admin | null) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: user ? 200 : 401,
      json: user || { message: "Please log in." },
    }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { message: "Please log in." } }),
  );
}

test("admin supplier workflows submit service contracts and show failures", async ({
  page,
}) => {
  await session(page, admin);
  let catalog = [structuredClone(supplier)];
  const writes: { method: string; path: string; body: unknown }[] = [];
  let rejectCreate = true;
  await page.route("**/api/admin/suppliers**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: catalog });
    const body = request.postDataJSON();
    writes.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      body,
    });
    if (request.method() === "POST" && rejectCreate) {
      rejectCreate = false;
      return route.fulfill({
        status: 409,
        json: { message: "Supplier already exists." },
      });
    }
    if (request.method() === "DELETE") catalog = [];
    return route.fulfill({ json: { success: true } });
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  await page.getByLabel("Supplier name").fill("New Coffee");
  await page
    .getByRole("combobox", { name: "Category" })
    .selectOption("FOOD_COFFEE");
  await page.getByLabel("Building", { exact: true }).fill("Science");
  await page.getByLabel("Floor", { exact: true }).fill("2");
  await page.getByLabel("Location description").fill("Near the entrance");
  await page.getByLabel("Latitude").fill("1.3");
  await page.getByLabel("Longitude").fill("103.7");
  await page.getByLabel("Opening time").fill("08:00");
  await page.getByLabel("Closing time").fill("20:00");
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Supplier already exists",
  );
  await expect(page.getByLabel("Supplier name")).toHaveValue("New Coffee");
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Supplier created" }),
  ).toBeVisible();
  expect(writes[1].body).toEqual({
    name: "New Coffee",
    category: "FOOD_COFFEE",
    location: {
      building: "Science",
      floor: 2,
      locationDescription: "Near the entrance",
      latitude: 1.3,
      longitude: 103.7,
      opensAt: "08:00",
      closesAt: "20:00",
    },
  });
  await page
    .getByRole("button", { name: "Edit supplier", exact: true })
    .click();
  await page.getByLabel("Supplier name").fill("Renamed Coffee");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Changes saved" }),
  ).toBeVisible();
  expect(writes[2]).toMatchObject({
    method: "PATCH",
    body: { name: "Renamed Coffee", category: "FOOD_COFFEE" },
  });
  await page.getByRole("button", { name: "Edit pickup location" }).click();
  await page.getByLabel("Building", { exact: true }).fill("Library");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Changes saved" }),
  ).toBeVisible();
  expect(writes[3]).toMatchObject({
    method: "PATCH",
    path: `/api/admin/suppliers/${supplier.id}/locations/${supplier.locations[0].id}`,
    body: { building: "Library", imageUrl: null },
  });
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(4);
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("button", { name: "Confirm deactivation" }).click();
  await expect(page.getByText("No suppliers found.")).toBeVisible();
  expect(writes[4].method).toBe("DELETE");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("account search, promotion and demotion require confirmation and protect self", async ({
  page,
}) => {
  await session(page, admin);
  await page.route("**/api/admin/suppliers", (route) =>
    route.fulfill({ json: [] }),
  );
  const changes: unknown[] = [];
  let search = "";
  await page.route("**/api/admin/accounts**", (route) => {
    if (route.request().method() === "GET") {
      search = new URL(route.request().url()).searchParams.get("search") || "";
      return route.fulfill({ json: [admin, student] });
    }
    changes.push(route.request().postDataJSON());
    return route.fulfill({
      json: { id: student.id, isAdmin: changes.length === 1 },
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Accounts & privileges" }).click();
  await expect(
    page.getByRole("button", { name: "Remove admin access" }),
  ).toBeDisabled();
  await page.getByLabel("Search accounts").fill("Student");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Make administrator" }).click();
  expect(search).toBe("Student");
  expect(changes).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm privilege change" }).click();
  await expect(page.getByRole("status")).toContainText(
    "active sessions have been revoked",
  );
  expect(changes).toEqual([{ isAdmin: true }]);
  await page
    .getByRole("article")
    .filter({ hasText: "student@u.nus.edu" })
    .getByRole("button", { name: "Remove admin access" })
    .click();
  await page.getByRole("button", { name: "Confirm privilege change" }).click();
  await expect(page.getByRole("status")).toContainText("is now a student");
  expect(changes).toEqual([{ isAdmin: true }, { isAdmin: false }]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("student and guest cannot open administrator controls", async ({
  page,
}) => {
  await session(page, student);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin dashboard" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Add supplier" })).toHaveCount(
    0,
  );
  await session(page, null);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Log in to continue" }),
  ).toBeVisible();
});

test("admin adapter rejects unauthenticated, cross-origin and unknown operations", async ({
  request,
  baseURL,
}) => {
  expect((await request.get("/api/admin/accounts")).status()).toBe(401);
  expect((await request.get("/api/admin/suppliers")).status()).toBe(401);
  expect(
    (
      await request.post("/api/admin/suppliers", {
        headers: { Origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/admin/suppliers", {
        headers: { Origin: baseURL! },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch("/api/admin/accounts/not-an-id/administrator", {
        headers: { Origin: baseURL! },
        data: { isAdmin: true },
      })
    ).status(),
  ).toBe(404);
});

for (const user of [admin, student]) {
  test(`${user.isAdmin ? "admin" : "student"} login opens the appropriate dashboard`, async ({
    page,
  }) => {
    let loggedIn = false;
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: loggedIn ? 200 : 401,
        json: loggedIn ? user : { message: "Please log in." },
      }),
    );
    await page.route("**/api/auth/refresh", (route) =>
      route.fulfill({ status: 401, json: { message: "Please log in." } }),
    );
    await page.route("**/api/auth/login", (route) => {
      loggedIn = true;
      return route.fulfill({ json: { user } });
    });
    await page.route("**/api/admin/suppliers", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/suppliers", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.goto("/login");
    await page.getByLabel("NUS email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(user.isAdmin ? /\/admin$/ : /\/suppliers$/);
  });
}
