import { test, expect } from "@playwright/test";

const profile = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "AccountUser",
  email: "account@u.nus.edu",
  phoneNumber: "81234567",
  isAdmin: true,
  status: "ACTIVE",
};

test("phone updates refresh the profile and report duplicate phone errors", async ({
  page,
}) => {
  let user = { ...profile };
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: user }),
  );
  let attempts = 0;
  await page.route("**/api/auth/phone-number", (route) => {
    expect(route.request().method()).toBe("PATCH");
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 409,
        json: { message: "Phone number is already registered." },
      });
    expect(route.request().postDataJSON()).toEqual({ phoneNumber: "91234567" });
    user = { ...user, phoneNumber: "91234567" };
    return route.fulfill({ json: user });
  });
  await page.goto("/account");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Admin dashboard" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Explore suppliers" }),
  ).toHaveCount(0);
  await page.getByLabel("New phone number").fill("91234567");
  await page.getByRole("button", { name: "Save phone number" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "already registered",
  );
  await page.getByRole("button", { name: "Save phone number" }).click();
  await expect(page.getByRole("status")).toContainText("Phone number updated");
  await expect(page.locator(".profile-details")).toContainText("91234567");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("password validation, incorrect current password, and successful sign-out", async ({
  page,
}) => {
  let signedIn = true;
  let attempts = 0;
  let refreshes = 0;
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: signedIn ? 200 : 401,
      json: signedIn ? profile : { message: "Please log in." },
    }),
  );
  await page.route("**/api/auth/refresh", (route) => {
    refreshes++;
    return route.fulfill({ status: 401, json: { message: "Please log in." } });
  });
  await page.route("**/api/auth/password", (route) => {
    attempts++;
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({
      currentPassword: "Current!Pass",
      newPassword: "Updated!Pass",
    });
    if (attempts === 1)
      return route.fulfill({
        status: 401,
        json: {
          code: "CURRENT_PASSWORD_INCORRECT",
          message: "Current password is incorrect.",
        },
      });
    signedIn = false;
    return route.fulfill({ json: { success: true } });
  });
  await page.goto("/account");
  await page
    .getByLabel("Current password", { exact: true })
    .fill("Current!Pass");
  await page.getByLabel("New password", { exact: true }).fill("Updated!Pass");
  await page.getByLabel("Confirm new password").fill("Different!Pass");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "do not match",
  );
  expect(attempts).toBe(0);
  await page.getByLabel("Confirm new password").fill("Updated!Pass");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Current password is incorrect",
  );
  expect(attempts).toBe(1);
  expect(refreshes).toBe(0);
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Password changed" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Your account" })).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Log in" }),
  ).toBeVisible();
});

test("profile adapter enforces authentication and origin checks", async ({
  request,
  baseURL,
}) => {
  for (const action of ["phone-number", "password"]) {
    expect(
      (
        await request.patch(`/api/auth/${action}`, {
          headers: { Origin: "https://untrusted.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.patch(`/api/auth/${action}`, {
          headers: { Origin: baseURL! },
          data: {},
        })
      ).status(),
    ).toBe(401);
  }
  expect(
    (
      await request.patch("/api/auth/email", {
        headers: { Origin: baseURL! },
        data: {},
      })
    ).status(),
  ).toBe(404);
});
