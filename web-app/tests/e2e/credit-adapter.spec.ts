import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

// HTTP contract checks exercise the real Next adapter with controlled upstreams.
// Credit Service database tests remain responsible for transaction semantics.
test.describe.configure({ mode: "serial" });
const userId = "10000000-0000-4000-8000-000000000001";
let userStatus = "ACTIVE";
let verified = true;
let userResponse = 200;
let creditResponse = 200;
let provisioningCalls = 0;
let balance: {
  userId: string;
  availableCredits: number;
  reservedCredits: number;
} | null = null;
let app: ChildProcess;
let userServer: Server;
let creditServer: Server;
let origin: string;

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  return address.port;
}

test.beforeAll(async () => {
  test.setTimeout(60_000);
  userServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url !== "/api/accounts/me" || req.headers.authorization !== "Bearer test-session") {
      res.writeHead(401).end(JSON.stringify({ message: "Unauthorized" }));
      return;
    }
    res.writeHead(userResponse).end(
      JSON.stringify(
        userResponse === 200
          ? {
              id: userId,
              status: userStatus,
              emailVerifiedAt: verified ? "2026-01-01T00:00:00Z" : null,
            }
          : { message: "Session invalid" },
      ),
    );
  });
  creditServer = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (creditResponse !== 200) {
      res.writeHead(creditResponse).end(JSON.stringify({ message: "Credit service failed" }));
      return;
    }
    if (req.method === "GET") {
      if (req.url !== `/v1/credit-accounts/${userId}` || req.headers.authorization !== "Bearer test-session") {
        res.writeHead(403).end(JSON.stringify({ message: "Wrong account or credential" }));
        return;
      }
      res.writeHead(balance ? 200 : 404).end(
        JSON.stringify(
          balance || {
            code: "ACCOUNT_NOT_FOUND",
            message: "Credit account not found",
          },
        ),
      );
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    provisioningCalls++;
    if (
      req.url !== "/v1/credit-accounts" ||
      req.headers.authorization !== "Bearer adapter-test-internal-token" ||
      body !== JSON.stringify({ userId })
    ) {
      res.writeHead(403).end(JSON.stringify({ message: "Invalid provisioning request" }));
      return;
    }
    balance ||= { userId, availableCredits: 100, reservedCredits: 0 };
    res.writeHead(201).end(JSON.stringify(balance));
  });
  const userPort = await listen(userServer);
  const creditPort = await listen(creditServer);
  const portProbe = createServer();
  const appPort = await listen(portProbe);
  await new Promise<void>((done) => portProbe.close(() => done()));
  origin = `http://127.0.0.1:${appPort}`;
  app = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(appPort)],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        APP_ORIGIN: origin,
        USER_SERVICE_URL: `http://127.0.0.1:${userPort}`,
        CREDIT_SERVICE_URL: `http://127.0.0.1:${creditPort}`,
        CREDIT_USER_SERVICE_TOKEN: "adapter-test-internal-token",
      },
    },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) throw new Error("Adapter test server exited before startup");
    try {
      if ((await fetch(`${origin}/login`)).ok) return;
    } catch {
      /* still starting */
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error("Adapter test server did not start");
});

test.afterAll(async () => {
  if (app && app.exitCode === null) {
    app.kill();
    await once(app, "exit");
  }
  for (const server of [userServer, creditServer]) {
    if (server?.listening) await new Promise<void>((done) => server.close(() => done()));
  }
});

test.beforeEach(() => {
  userStatus = "ACTIVE";
  verified = true;
  userResponse = 200;
  creditResponse = 200;
  provisioningCalls = 0;
  balance = null;
});

function headers() {
  return { Origin: origin, Cookie: "foc_access=test-session" };
}

test("provisions only the live user and preserves their balance on refresh", async ({ request }) => {
  const response = await request.post(`${origin}/api/credits`, {
    headers: headers(),
    data: { userId: "someone-else", availableCredits: 99999 },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    userId,
    availableCredits: 100,
    reservedCredits: 0,
  });
  expect(provisioningCalls).toBe(1);
  balance = { userId, availableCredits: 65, reservedCredits: 35 };
  const refreshed = await request.post(`${origin}/api/credits`, {
    headers: headers(),
    data: {},
  });
  expect(await refreshed.json()).toEqual(balance);
  expect(provisioningCalls).toBe(1);
});

test("GET reports a missing account without provisioning", async ({ request }) => {
  const response = await request.get(`${origin}/api/credits`, {
    headers: headers(),
  });
  expect(response.status()).toBe(404);
  expect(provisioningCalls).toBe(0);
});

test("rejects unauthenticated and cross-origin provisioning", async ({ request }) => {
  expect(
    (
      await request.post(`${origin}/api/credits`, {
        headers: { Origin: origin },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(`${origin}/api/credits`, {
        headers: { ...headers(), Origin: "https://elsewhere.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(provisioningCalls).toBe(0);
});

test("rejects unverified and suspended users", async ({ request }) => {
  verified = false;
  expect(
    (
      await request.post(`${origin}/api/credits`, {
        headers: headers(),
        data: {},
      })
    ).status(),
  ).toBe(403);
  verified = true;
  userStatus = "SUSPENDED";
  expect(
    (
      await request.post(`${origin}/api/credits`, {
        headers: headers(),
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(provisioningCalls).toBe(0);
});

test("does not provision when session validation or balance reads fail", async ({ request }) => {
  userResponse = 401;
  expect(
    (
      await request.post(`${origin}/api/credits`, {
        headers: headers(),
        data: {},
      })
    ).status(),
  ).toBe(401);
  userResponse = 200;
  creditResponse = 500;
  expect(
    (
      await request.post(`${origin}/api/credits`, {
        headers: headers(),
        data: {},
      })
    ).status(),
  ).toBe(503);
  creditResponse = 401;
  expect(
    (
      await request.post(`${origin}/api/credits`, {
        headers: headers(),
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(provisioningCalls).toBe(0);
});
