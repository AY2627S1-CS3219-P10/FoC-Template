import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });
const match = {
  supplierId: "20000000-0000-4000-8000-000000000001",
  supplierName: "CLB Printer",
  locationId: "30000000-0000-4000-8000-000000000001",
  building: "Central Library",
  floor: 4,
  locationDescription: "Beside the lift lobby",
};
let app: ChildProcess;
let user: Server;
let supplier: Server;
let origin: string;
let upstreamStatus = 409;

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server port");
  return address.port;
}

test.beforeAll(async () => {
  test.setTimeout(60000);
  user = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        id: "10000000-0000-4000-8000-000000000001",
        isAdmin: true,
      }),
    );
  });
  supplier = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.writeHead(upstreamStatus).end(
      JSON.stringify({
        code: "POSSIBLE_SUPPLIER_DUPLICATE",
        message: "Review matching outlets",
        matches: [{ ...match, internalDebug: "must not be forwarded" }],
      }),
    );
  });
  const userPort = await listen(user);
  const supplierPort = await listen(supplier);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>((done) => reservation.close(() => done()));
  origin = `http://127.0.0.1:${port}`;
  app = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        USER_SERVICE_URL: `http://127.0.0.1:${userPort}`,
        SUPPLIER_SERVICE_URL: `http://127.0.0.1:${supplierPort}`,
      },
      stdio: "ignore",
    },
  );
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
});

test.afterAll(async () => {
  if (app && app.exitCode === null) {
    const stopped = once(app, "exit");
    app.kill("SIGTERM");
    await stopped;
  }
  await Promise.all(
    [user, supplier].filter(Boolean).map(
      (server) =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
    ),
  );
});

test("the real admin API forwards only public matching-outlet details", async ({
  request,
}) => {
  upstreamStatus = 409;
  const response = await request.post(`${origin}/api/admin/suppliers`, {
    headers: { Origin: origin, Cookie: "foc_access=test-session" },
    data: {
      name: "Printing at CLB",
      category: "PRINTING",
      location: { floor: 4 },
    },
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({
    code: "POSSIBLE_SUPPLIER_DUPLICATE",
    message: "Review matching outlets",
    matches: [match],
  });
});

test("infrastructure errors never expose match payloads", async ({
  request,
}) => {
  upstreamStatus = 500;
  const response = await request.post(`${origin}/api/admin/suppliers`, {
    headers: { Origin: origin, Cookie: "foc_access=test-session" },
    data: { name: "Printing at CLB" },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).not.toHaveProperty("matches");
});
