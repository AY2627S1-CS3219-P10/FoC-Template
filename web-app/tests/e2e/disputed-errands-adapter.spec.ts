import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });

const requesterId = "10000000-0000-4000-8000-000000000002";
const courierId = "10000000-0000-4000-8000-000000000003";
const baseErrand = {
  id: "30000000-0000-4000-8000-000000000001",
  requesterId,
  courierId,
  status: "OPEN",
  pickupLocationId: "20000000-0000-4000-8000-000000000001",
  pickupSupplierName: "Campus Coffee",
  pickupLocationLabel: "UTown",
  description: "Errand",
  deliveryDestination: "COM3",
  instructions: "Call",
  offeredCredits: 20,
  version: 1,
  createdAt: "2026-11-09T01:00:00Z",
  updatedAt: "2026-11-09T02:00:00Z",
  disputedAt: null,
};

let isAdmin = true;
let orderFailure = false;
let manageOffsets: number[] = [];
let actions: { path: string; body: unknown; idempotencyKey?: string }[] = [];
let app: ChildProcess;
let userServer: Server;
let orderServer: Server;
let origin: string;

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  return address.port;
}

test.beforeAll(async () => {
  test.setTimeout(60_000);
  userServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== "Bearer test-session") {
      res.writeHead(401).end(JSON.stringify({ message: "Unauthorized" }));
      return;
    }
    if (req.url === "/api/accounts/me") {
      res.writeHead(200).end(
        JSON.stringify({
          id: "10000000-0000-4000-8000-000000000001",
          username: "Administrator",
          isAdmin,
          status: "ACTIVE",
        }),
      );
      return;
    }
    const id = req.url?.match(/^\/api\/accounts\/([^/]+)\/identity$/)?.[1];
    if (id === requesterId || id === courierId) {
      res.writeHead(200).end(
        JSON.stringify({
          id,
          username: id === requesterId ? "Requester" : "Courier",
        }),
      );
      return;
    }
    res.writeHead(404).end(JSON.stringify({ message: "Not found" }));
  });
  orderServer = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (orderFailure) {
      res.writeHead(500).end(JSON.stringify({ message: "Database unavailable" }));
      return;
    }
    const url = new URL(req.url ?? "/", "http://order.test");
    if (
      req.method === "POST" &&
      /^\/api\/errands\/[0-9a-f-]+\/(dispute|resolve-dispute)$/.test(url.pathname) &&
      req.headers.authorization === "Bearer test-session"
    ) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      actions.push({
        path: url.pathname,
        body,
        ...(req.headers["idempotency-key"]
          ? { idempotencyKey: String(req.headers["idempotency-key"]) }
          : {}),
      });
      const errand = {
        ...baseErrand,
        status: url.pathname.endsWith("resolve-dispute") ? "RESOLVED" : "DISPUTED",
      };
      res.writeHead(200).end(
        JSON.stringify(
          url.pathname.endsWith("resolve-dispute")
            ? { operationId: "50000000-0000-4000-8000-000000000001", status: "SUCCEEDED", errand }
            : errand,
        ),
      );
      return;
    }
    if (
      url.pathname !== "/api/errands/manage" ||
      req.headers.authorization !== "Bearer test-session"
    ) {
      res.writeHead(404).end(JSON.stringify({ message: "Not found" }));
      return;
    }
    const offset = Number(url.searchParams.get("offset"));
    manageOffsets.push(offset);
    if (offset === 0) {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        ...baseErrand,
        id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        ...(index === 99
          ? { status: "DISPUTED", disputedAt: "2026-11-09T03:00:00Z" }
          : {}),
      }));
      res.writeHead(200).end(JSON.stringify(firstPage));
      return;
    }
    res.writeHead(200).end(
      JSON.stringify([
        { ...baseErrand, id: "30000000-0000-4000-8000-000000000101", status: "COMPLETED" },
        {
          ...baseErrand,
          id: "30000000-0000-4000-8000-000000000102",
          status: "RESOLVED",
          disputedAt: "2026-11-09T04:00:00Z",
        },
      ]),
    );
  });
  const userPort = await listen(userServer);
  const orderPort = await listen(orderServer);
  const portProbe = createServer();
  const appPort = await listen(portProbe);
  await new Promise<void>((done) => portProbe.close(() => done()));
  origin = `http://127.0.0.1:${appPort}`;
  app = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        APP_ORIGIN: origin,
        USER_SERVICE_URL: `http://127.0.0.1:${userPort}`,
        ORDER_SERVICE_URL: `http://127.0.0.1:${orderPort}`,
      },
    },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null)
      throw new Error("Adapter test server exited before startup");
    try {
      if ((await fetch(`${origin}/login`)).ok) return;
    } catch {
      // Still starting.
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
  for (const server of [userServer, orderServer]) {
    if (server?.listening)
      await new Promise<void>((done) => server.close(() => done()));
  }
});

test.beforeEach(() => {
  isAdmin = true;
  orderFailure = false;
  manageOffsets = [];
  actions = [];
});

const headers = () => ({ Cookie: "foc_access=test-session" });

test("filters disputed errands across every populated management page", async ({ request }) => {
  const response = await request.get(`${origin}/api/admin/disputed-errands`, {
    headers: headers(),
  });
  expect(response.status()).toBe(200);
  const errands = await response.json();
  expect(errands).toHaveLength(2);
  expect(errands.map((errand: { status: string }) => errand.status)).toEqual([
    "DISPUTED",
    "RESOLVED",
  ]);
  expect(errands[0]).toMatchObject({
    requesterUsername: "Requester",
    courierUsername: "Courier",
  });
  expect(manageOffsets).toEqual([0, 100]);
});

test("rejects non-administrators before querying Order Service", async ({ request }) => {
  isAdmin = false;
  const response = await request.get(`${origin}/api/admin/disputed-errands`, {
    headers: headers(),
  });
  expect(response.status()).toBe(403);
  expect(manageOffsets).toEqual([]);
});

test("propagates a safe Order Service failure", async ({ request }) => {
  orderFailure = true;
  const response = await request.get(`${origin}/api/admin/disputed-errands`, {
    headers: headers(),
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toMatchObject({
    message: "The request could not be completed. Please try again.",
  });
});

test("validates and forwards dispute statements and resolution idempotency", async ({ request }) => {
  const dispute = await request.post(
    `${origin}/api/errands/${baseErrand.id}/dispute`,
    {
      headers: { ...headers(), Origin: origin },
      data: { explanation: "The delivery was incomplete." },
    },
  );
  expect(dispute.status()).toBe(200);
  const key = "50000000-0000-4000-8000-000000000002";
  const resolution = await request.post(
    `${origin}/api/errands/${baseErrand.id}/resolve-dispute`,
    {
      headers: { ...headers(), Origin: origin },
      data: { outcome: "REFUND_REQUESTER", idempotencyKey: key },
    },
  );
  expect(resolution.status()).toBe(200);
  expect(actions).toEqual([
    {
      path: `/api/errands/${baseErrand.id}/dispute`,
      body: { statement: "The delivery was incomplete." },
    },
    {
      path: `/api/errands/${baseErrand.id}/resolve-dispute`,
      body: { outcome: "REFUND_REQUESTER" },
      idempotencyKey: key,
    },
  ]);
  const invalid = await request.post(
    `${origin}/api/errands/${baseErrand.id}/dispute`,
    {
      headers: { ...headers(), Origin: origin },
      data: { explanation: "   " },
    },
  );
  expect(invalid.status()).toBe(400);
  expect(actions).toHaveLength(2);
});
