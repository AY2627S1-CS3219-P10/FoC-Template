import { test, expect } from "@playwright/test";
const user = { id: "10000000-0000-4000-8000-000000000001", username: "ErrandUser", isAdmin: false };
const errand = { id: "30000000-0000-4000-8000-000000000001", requesterId: user.id, requesterUsername: "ErrandUser", courierId: null, status: "OPEN", description: "Pick up my coffee", pickupSupplierName: "Campus Cafe", pickupLocationLabel: "Campus Cafe@Central Library", deliveryDestination: "UTown entrance", instructions: "Meet downstairs", offeredCredits: 20, version: 0, createdAt: "2026-10-12T01:00:00Z", updatedAt: "2026-10-12T01:00:00Z" };
test.beforeEach(async ({ page }) => {
  await page.route("**/api/suppliers", (route) => route.fulfill({ json: [{ id: "cafe", name: "Campus Cafe", locations: [{ id: "10000000-0000-4000-8000-000000000002", supplierAtLocation: "Cafe", building: "Library", floor: 1 }] }] }));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: user }));
  await page.route("**/api/credits", (route) => route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }));
});
test("create an errand and refresh its listing and credit balance", async ({ page }) => {
  let created = false; let creditCalls = 0;
  await page.route("**/api/credits", (route) => { creditCalls++; return route.fulfill({ json: { availableCredits: created ? 80 : 100, reservedCredits: created ? 20 : 0 } }); });
  await page.route("**/api/errands?*", (route) => route.fulfill({ json: created ? [errand] : [] }));
  await page.route("**/api/errands", (route) => {
    const body = route.request().postDataJSON();
    expect(body.description).toBe("Pick up my coffee"); expect(body.offeredCredits).toBe(20); expect(body).not.toHaveProperty("requesterId"); expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    created = true; return route.fulfill({ status: 201, json: { status: "SUCCEEDED", operationId: "operation", errand } });
  });
  await page.goto("/errands/create");
  await expect(page.getByRole("option", { name: "Cafe", exact: true })).toHaveCount(1);
  await page.getByRole("combobox", { name: "Pickup location" }).selectOption("10000000-0000-4000-8000-000000000002");
  await page.getByLabel("Errand description").fill("Pick up my coffee"); await page.getByLabel("Delivery destination").fill("UTown entrance"); await page.getByLabel("Pickup or delivery instructions").fill("Meet downstairs"); await page.getByLabel("Offered credits").fill("20");
  await page.locator("form").getByRole("button", { name: "Create errand", exact: true }).click();
  await expect(page.getByText("Errand created. Your offered credits have been reserved.")).toBeVisible(); await expect(page.getByLabel("Errand description")).toHaveValue(""); expect(creditCalls).toBeGreaterThan(1); await page.getByRole("link", { name: "Browse errands" }).click(); await expect(page.getByRole("article")).toContainText("Pick up my coffee");
});
test("uncertain creation retries the identical request and pending creation can be checked", async ({ page }) => {
  await page.route("**/api/errands?*", (route) => route.fulfill({ json: [] }));
  let first: unknown; let calls = 0;
  await page.route("**/api/errands", (route) => { calls++; const body = route.request().postDataJSON(); if (calls === 1) { first = body; return route.fulfill({ status: 503, json: { message: "Service unavailable" } }); } expect(body).toEqual(first); return route.fulfill({ status: 202, json: { status: "PENDING", operationId: "10000000-0000-4000-8000-000000000003" } }); });
  await page.route("**/api/errand-operations/*", (route) => route.fulfill({ json: { status: "SUCCEEDED", operationId: "operation", errand } }));
  await page.goto("/errands/create"); await page.getByRole("combobox", { name: "Pickup location" }).selectOption("10000000-0000-4000-8000-000000000002"); await page.getByLabel("Errand description").fill("Coffee"); await page.getByLabel("Delivery destination").fill("UTown"); await page.getByLabel("Pickup or delivery instructions").fill("Call me"); await page.getByLabel("Offered credits").fill("20");
  await page.locator("form").getByRole("button", { name: "Create errand", exact: true }).click(); await expect(page.getByLabel("Errand description")).toBeDisabled(); await page.getByRole("button", { name: "Retry this request" }).click(); await expect(page.getByText("Your request is still being processed. Check its status shortly.")).toBeVisible(); await page.getByRole("button", { name: "Check request status" }).click(); await expect(page.getByText("Errand created. Your offered credits have been reserved.")).toBeVisible();
});
test("creation adapter rejects cross-origin writes", async ({ request }) => {
  const response = await request.post("/api/errands", { headers: { Origin: "https://untrusted.example" }, data: {} }); expect(response.status()).toBe(403);
});
test("global shortcut drags without navigation, remembers its position and opens creation", async ({ page, isMobile }) => {
  await page.route("**/api/errands?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  const shortcut = page.getByRole("button", { name: "Create errand", exact: true });
  await expect(shortcut).toBeVisible(); const before = (await shortcut.boundingBox())!;
  if (!isMobile) {
    await page.mouse.move(before.x + 30, before.y + 20); await page.mouse.down(); await page.mouse.move(60, 180, { steps: 8 }); await page.mouse.up();
  } else {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: before.x + 20, y: before.y + 20 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 50, y: 170 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
  }
  await expect(page).toHaveURL(/\/$/); await expect.poll(async () => (await shortcut.boundingBox())!.y).toBeLessThan(before.y);
  const moved = (await shortcut.boundingBox())!; await page.goto("/errands"); await expect(shortcut).toBeVisible(); await expect.poll(async () => Math.abs((await shortcut.boundingBox())!.y - moved.y)).toBeLessThan(2);
  await shortcut.focus(); await page.keyboard.press("ArrowDown"); await expect.poll(async () => (await shortcut.boundingBox())!.y).toBeGreaterThan(moved.y);
  await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/errands\/create$/); await expect(page.getByRole("heading", { name: "Create errand", exact: true })).toBeVisible(); await expect(page.getByRole("combobox", { name: "Pickup location" })).toBeVisible();
});
test("compact cards link to a flexible detail card containing full information", async ({ page }) => {
  await page.route(`**/api/errands/${errand.id}`, (route) => route.fulfill({ json: { ...errand, instructions: "Meet downstairs. ".repeat(50) } }));
  await page.route("**/api/errands?*", (route) => route.fulfill({ json: [errand] }));
  await page.goto("/"); await page.getByRole("navigation").getByRole("link", { name: "Errands", exact: true }).click();
  await expect(page).toHaveURL(/\/errands$/); await expect(page.getByRole("heading", { name: "Errands", exact: true })).toBeVisible();
  const card = page.getByRole("article"); await expect(card).toContainText("Pick up my coffee"); await expect(card).toContainText("Campus Cafe"); await expect(card).toContainText("UTown entrance"); await expect(card).not.toContainText("Meet downstairs"); await expect(card).not.toContainText("20 credits");
  await card.getByRole("link", { name: "View errand: Pick up my coffee" }).click(); await expect(page).toHaveURL(new RegExp(`/errands/${errand.id}$`)); await expect(page.getByRole("article")).toContainText("Meet downstairs. ".repeat(50).trim()); await expect(page.getByRole("article")).toContainText("20 credits"); await expect(page.getByRole("button", { name: "Edit errand" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("owner can edit and confirm deletion of their own request", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ...user, isAdmin: true } }));
  let value = { ...errand }; let removed = false;
  await page.route(`**/api/errands/${errand.id}`, (route) => {
    const method = route.request().method();
    if (method === "PATCH") { const body = route.request().postDataJSON(); expect(body.expectedVersion).toBe(0); value = { ...value, ...body, version: 1 }; return route.fulfill({ json: { status: "SUCCEEDED", operationId: "op", errand: value } }); }
    if (method === "DELETE") { removed = true; return route.fulfill({ json: { status: "SUCCEEDED", operationId: "op", errand: value } }); }
    return route.fulfill({ json: value });
  });
  await page.goto(`/errands/${errand.id}`); await expect(page.getByRole("button", { name: "Edit errand", exact: true })).toHaveCSS("background-color", "rgb(37, 108, 67)"); await expect(page.getByRole("button", { name: "Delete errand", exact: true })).toHaveCSS("background-color", "rgb(180, 35, 43)"); await expect(page.locator("dl")).toContainText("ErrandUser"); await page.getByRole("button", { name: "Edit errand", exact: true }).click(); await page.getByLabel("Delivery destination").fill("Science entrance"); await page.getByLabel("Offered credits").fill("30"); await page.getByRole("button", { name: "Save changes" }).click(); await expect(page.getByRole("article")).toContainText("Science entrance"); await expect(page.getByRole("article")).toContainText("30 credits");
  await page.getByRole("button", { name: "Delete errand", exact: true }).click(); expect(removed).toBe(false); await page.getByRole("button", { name: "Confirm delete" }).click(); await expect(page.getByRole("heading", { name: "Errand deleted" })).toBeVisible(); expect(removed).toBe(true);
});
test("other users have no edit/delete controls and admins have delete only", async ({ page }) => {
  await page.route(`**/api/errands/${errand.id}`, (route) => route.fulfill({ json: { ...errand, requesterId: "10000000-0000-4000-8000-000000000005" } }));
  await page.goto(`/errands/${errand.id}`); await expect(page.getByRole("article")).toBeVisible(); await expect(page.getByRole("button", { name: "Edit errand", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Delete errand", exact: true })).toHaveCount(0);
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { ...user, isAdmin: true } }));
  await page.reload(); await expect(page.getByRole("button", { name: "Delete errand", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Edit errand", exact: true })).toHaveCount(0);
});
test("empty state, service failure and retry never substitute sample errands", async ({ page }) => {
  let calls = 0; await page.route("**/api/errands?*", (route) => { calls++; return calls === 2 ? route.fulfill({ status: 503, json: { message: "The order service is unavailable." } }) : route.fulfill({ json: [] }); });
  await page.goto("/errands"); await expect(page.getByRole("heading", { name: "No open errands right now" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh errands" }).click(); await expect(page.getByRole("alert").filter({ hasText: "unavailable" })).toContainText("unavailable"); await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry errands" }).click(); await expect(page.getByRole("heading", { name: "No open errands right now" })).toBeVisible();
});
test("guests are asked to log in before browsing errands", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 401, json: {} })); await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto("/errands"); await expect(page.getByText("Log in to see open campus errands.")).toBeVisible(); await expect(page.getByRole("article")).toHaveCount(0);
});
test("errand adapter requires authentication", async ({ request }) => {
  const response = await request.get("/api/errands"); expect(response.status()).toBe(401); expect(response.headers()["cache-control"]).toBe("no-store");
});
test("catalogue shows coin rewards and supports all time and credit sort orders", async ({ page }) => {
  const values = [{ ...errand, id: "first", description: "Older request", offeredCredits: 10 }, { ...errand, id: "second", description: "Newest request", offeredCredits: 30 }];
  await page.route("**/api/errands?*", (route) => {
    const url = new URL(route.request().url()); expect(url.searchParams.get("offset")).toBe("0");
    const ascending = ["oldest", "credits-lowest"].includes(url.searchParams.get("sort") ?? "");
    return route.fulfill({ json: ascending ? values : [...values].reverse() });
  });
  await page.goto("/errands"); const cards = page.getByRole("article");
  await expect(cards.first()).toContainText("Newest request"); await expect(cards.first().getByLabel("30 credits offered")).toBeVisible();
  await page.getByRole("combobox", { name: "Sort errands" }).selectOption("oldest"); await expect(cards.first()).toContainText("Older request");
  await page.getByRole("combobox", { name: "Sort errands" }).selectOption("credits-highest"); await expect(cards.first()).toContainText("Newest request");
  await page.getByRole("combobox", { name: "Sort errands" }).selectOption("credits-lowest"); await expect(cards.first()).toContainText("Older request");
  await page.getByRole("combobox", { name: "Sort errands" }).selectOption("newest"); await expect(cards.first()).toContainText("Newest request");
});
