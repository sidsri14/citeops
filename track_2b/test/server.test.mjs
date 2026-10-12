import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createServer } from "../src/server.mjs";
import { config, incident } from "./fixtures.mjs";

async function withServer(callback) {
  const server = createServer(config({ fixtureMode: true, modelApiKey: "" }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await callback(`http://127.0.0.1:${address.port}`, address.port); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("serves a hardened UI and health metadata", async () => {
  await withServer(async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(await page.text(), /Evidence before action/);
    const health = await (await fetch(`${base}/health`)).json();
    assert.deepEqual({ status: health.status, fixture_mode: health.fixture_mode }, { status: "ok", fixture_mode: true });
  });
});

test("creates fixture briefs only through JSON POST requests", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/briefs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(incident),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).apertus_used, false);
    const wrongType = await fetch(`${base}/api/briefs`, { method: "POST", body: JSON.stringify(incident) });
    assert.equal(wrongType.status, 415);
  });
});

test("rejects cross-origin, rebinding, and oversized requests", async () => {
  await withServer(async (base, port) => {
    const crossOrigin = await fetch(`${base}/api/briefs`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify(incident),
    });
    assert.equal(crossOrigin.status, 403);
    const huge = await fetch(`${base}/api/briefs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(70_000) }),
    });
    assert.equal(huge.status, 413);
    const hostStatus = await new Promise((resolve, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port, path: "/health", headers: { host: "evil.example" } }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      request.on("error", reject);
      request.end();
    });
    assert.equal(hostStatus, 403);
  });
});
