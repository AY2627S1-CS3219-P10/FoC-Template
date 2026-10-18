import { test, expect } from "@playwright/test";
const courier = { id: "10000000-0000-4000-8000-000000000002", username: "Courier", isAdmin: false };
const requester = { id: "10000000-0000-4000-8000-000000000001", username: "Requester", isAdmin: false };
const initial = { id: "30000000-0000-4000-8000-000000000001", requesterId: requester.id, requesterUsername: requester.username, courierId: null as string | null, availableForAcceptance: true, status: "OPEN", description: "Lunch delivery", pickupLocationLabel: "Cafe@Library", deliveryDestination: "UTown", instructions: "Meet downstairs", offeredCredits: 20, version: 0, createdAt: "2026-10-18T01:00:00Z", updatedAt: "2026-10-18T01:00:00Z" };
test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: courier }));
  await page.route("**/api/credits", (route) => route.fulfill({ json: { availableCredits: 100, reservedCredits: 0 } }));
});
test("courier accepts, picks up, delivers and tracks the job in My deliveries", async ({ page }) => {
  let value = { ...initial };
  await page.route("**/api/errands?*", (route) => { const assigned = new URL(route.request().url()).searchParams.get("scope") === "assigned"; return route.fulfill({ json: assigned ? value.courierId === courier.id ? [value] : [] : value.status === "OPEN" ? [value] : [] }); });
  await page.route(`**/api/errands/${initial.id}`, (route) => route.fulfill({ json: value }));
  await page.route(`**/api/errands/${initial.id}/*`, (route) => {
    const action = route.request().url().split("/").pop(); expect(route.request().postDataJSON()).toEqual({});
    value = { ...value, courierId: courier.id, status: action === "accept" ? "ACCEPTED" : action === "pickup" ? "PICKED_UP" : "DELIVERED", availableForAcceptance: false };
    return route.fulfill({ json: value });
  });
  await page.goto(`/errands/${initial.id}`); await page.getByRole("button", { name: "Accept errand", exact: true }).click(); await expect(page.getByLabel("Status: Accepted", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Accept errand", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark as picked up", exact: true }).click(); await expect(page.getByLabel("Status: Picked up", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Release errand", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark as delivered", exact: true }).click(); await expect(page.getByLabel("Status: Delivered", { exact: true })).toBeVisible(); await expect(page.getByText(/Awaiting requester confirmation/)).toBeVisible(); await expect(page.getByRole("button", { name: "Mark as delivered", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to errands" }).click(); await page.getByRole("button", { name: "My deliveries", exact: true }).click(); await expect(page.getByRole("article")).toContainText("Lunch delivery"); await expect(page.getByRole("article").getByLabel("Status: Delivered", { exact: true })).toBeVisible();
});
test("courier release requires confirmation and prevents reacceptance", async ({ page }) => {
  let value = { ...initial, courierId: courier.id, status: "ACCEPTED", availableForAcceptance: false }; let calls = 0;
  await page.route(`**/api/errands/${initial.id}`, (route) => route.fulfill({ json: value }));
  await page.route(`**/api/errands/${initial.id}/courier-cancel`, (route) => { calls++; value = { ...value, courierId: null as unknown as string, status: "OPEN" }; return route.fulfill({ json: value }); });
  await page.goto(`/errands/${initial.id}`); await page.getByRole("button", { name: "Release errand", exact: true }).click(); expect(calls).toBe(0); await expect(page.getByText(/will not be able to accept it again/)).toBeVisible(); await page.getByRole("button", { name: "Confirm release", exact: true }).click(); await expect(page.getByLabel("Status: Open", { exact: true })).toBeVisible(); expect(calls).toBe(1); await expect(page.getByRole("button", { name: "Accept errand", exact: true })).toHaveCount(0);
});
test("requester confirms receipt, while pending cancellation can be checked", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: requester }));
  let value = { ...initial, courierId: courier.id, status: "DELIVERED" };
  await page.route(`**/api/errands/${initial.id}`, (route) => route.fulfill({ json: value }));
  await page.route(`**/api/errands/${initial.id}/confirm`, (route) => { value = { ...value, status: "COMPLETED" }; return route.fulfill({ json: value }); });
  await page.goto(`/errands/${initial.id}`); await expect(page.getByRole("button", { name: "Mark as delivered", exact: true })).toHaveCount(0); await page.getByRole("button", { name: "Confirm receipt", exact: true }).click(); await page.getByRole("button", { name: "Confirm receipt", exact: true }).click(); await expect(page.getByLabel("Status: Completed", { exact: true })).toBeVisible();
  value = { ...value, status: "ACCEPTED" }; await page.reload();
  await page.route(`**/api/errands/${initial.id}/cancel`, (route) => route.fulfill({ status: 202, json: { operationId: "op", status: "PENDING" } }));
  await page.route("**/api/errand-operations/op", (route) => { value = { ...value, status: "CANCELLED" }; return route.fulfill({ json: { operationId: "op", status: "SUCCEEDED", errand: value } }); });
  await page.getByRole("button", { name: "Cancel request", exact: true }).click(); await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click(); await page.getByRole("button", { name: "Check cancellation status", exact: true }).click(); await expect(page.getByLabel("Status: Cancelled", { exact: true })).toBeVisible();
});
test("lost acceptance race refreshes status and exposes no assigned-courier controls", async ({ page }) => {
  let value = { ...initial };
  await page.route(`**/api/errands/${initial.id}`, (route) => route.fulfill({ json: value }));
  await page.route(`**/api/errands/${initial.id}/accept`, (route) => { value = { ...value, courierId: "another-courier", status: "ACCEPTED", availableForAcceptance: false }; return route.fulfill({ status: 409, json: { message: "Another courier accepted this errand." } }); });
  await page.goto(`/errands/${initial.id}`); await page.getByRole("button", { name: "Accept errand", exact: true }).click(); await expect(page.getByText("Another courier accepted this errand.", { exact: true })).toBeVisible(); await expect(page.getByLabel("Status: Accepted", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Mark as picked up", exact: true })).toHaveCount(0);
});
test("action adapter rejects cross-origin and unauthenticated requests", async ({ request }) => {
  const crossOrigin = await request.post(`/api/errands/${initial.id}/accept`, { headers: { Origin: "https://untrusted.example" }, data: {} }); expect(crossOrigin.status()).toBe(403);
  const anonymous = await request.post(`/api/errands/${initial.id}/accept`, { headers: { Origin: "http://127.0.0.1:3100" }, data: {} }); expect(anonymous.status()).toBe(401);
});
