import assert from "node:assert/strict";
import test from "node:test";
import { validateBriefOutput, validateIncidentInput } from "../src/schema.mjs";
import { brief, incident } from "./fixtures.mjs";

test("accepts a bounded incident and a fully cited brief", () => {
  const normalized = validateIncidentInput(incident);
  assert.deepEqual(validateBriefOutput(brief, normalized.events), brief);
});

test("rejects duplicate input event IDs", () => {
  const duplicate = { ...incident, events: [incident.events[0], { ...incident.events[1], id: "evt-1" }] };
  assert.throws(() => validateIncidentInput(duplicate), /Duplicate event ID/);
});

test("rejects invented evidence IDs", () => {
  const invented = structuredClone(brief);
  invented.actions[0].evidence_ids = ["evt-does-not-exist"];
  assert.throws(() => validateBriefOutput(invented, incident.events), (error) => error.code === "invalid_model_output");
});

test("rejects uncited actions and model-added fields", () => {
  const uncited = structuredClone(brief);
  uncited.actions[0].evidence_ids = [];
  assert.throws(() => validateBriefOutput(uncited, incident.events), /must contain 1-12/);
  assert.throws(() => validateBriefOutput({ ...brief, command: "rm -rf /" }, incident.events), (error) => error.code === "invalid_model_output");
});

test("rejects fields outside the exact input contract", () => {
  assert.throws(() => validateIncidentInput({ ...incident, callback_url: "https://example.com" }), /must contain exactly/);
});
