import assert from "node:assert/strict";
import test from "node:test";
import { CiteOpsService } from "../src/service.mjs";
import { brief, config, incident } from "./fixtures.mjs";

test("deduplicates concurrent calls with the same request ID", async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const client = { complete: async () => { calls += 1; await pending; return brief; } };
  const service = new CiteOpsService(config(), { client });
  const first = service.createBrief(incident);
  const second = service.createBrief(structuredClone(incident));
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
});

test("rejects request-ID reuse with different incident data", async () => {
  const service = new CiteOpsService(config(), { client: { complete: async () => brief } });
  await service.createBrief(incident);
  assert.throws(() => service.createBrief({ ...incident, service: "different-service" }), (error) => error.status === 409);
});

test("redacts secrets before the client receives a prompt", async () => {
  let userPrompt;
  const client = { complete: async (_system, user) => { userPrompt = user; return brief; } };
  const service = new CiteOpsService(config(), { client });
  const secretIncident = structuredClone(incident);
  secretIncident.events[0].message = "api_key=top-secret-value failure";
  const response = await service.createBrief(secretIncident);
  assert.equal(response.redactions, 1);
  assert.match(userPrompt, /api_key=\[REDACTED\]/);
  assert.doesNotMatch(userPrompt, /top-secret-value/);
  assert.equal(response.apertus_used, true);
});

test("labels fixture output and never claims Apertus was used", async () => {
  const service = new CiteOpsService(config({ fixtureMode: true, modelApiKey: "" }));
  const response = await service.createBrief(incident);
  assert.equal(response.inference_mode, "fixture-preview");
  assert.equal(response.apertus_used, false);
});

test("does not permanently cache transient model failures", async () => {
  let calls = 0;
  const client = { complete: async () => { calls += 1; if (calls === 1) throw new Error("temporary"); return brief; } };
  const service = new CiteOpsService(config(), { client });
  await assert.rejects(() => service.createBrief(incident), /temporary/);
  await service.createBrief(incident);
  assert.equal(calls, 2);
});
