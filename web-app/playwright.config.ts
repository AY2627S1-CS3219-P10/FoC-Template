/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of web-app/playwright.config.ts tooling configuration.
 * Author review: Validated web-app/playwright.config.ts settings for testDir, fullyParallel, workers; edited configuration layout and naming for consistency.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 1,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command:
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
  },
});
