import assert from "node:assert/strict";
import test from "node:test";
import { ApertusClient } from "../src/apertus_client.mjs";
import { loadConfig, validateModelBaseUrl } from "../src/config.mjs";
import { brief, config } from "./fixtures.mjs";

test("requires HTTPS for non-private model endpoints", () => {
  assert.throws(() => validateModelBaseUrl("http://api.example.com/v1"), /must use HTTPS/);
  assert.equal(validateModelBaseUrl("http://127.0.0.1:8000/v1").href, "http://127.0.0.1:8000/v1/");
  assert.equal(validateModelBaseUrl("http://vllm:8000/v1").href, "http://vllm:8000/v1/");
});

test("rejects a non-Apertus model name and unsafe inference deadlines", () => {
  assert.throws(() => loadConfig({ LLM_NAME: "another/model" }), /Apertus family/);
  assert.throws(() => loadConfig({ LLM_TIMEOUT_MS: "20" }), /LLM_TIMEOUT_MS/);
});

test("sends the official model variables through an OpenAI-compatible request", async () => {
  let captured;
  const fakeFetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(brief) } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new ApertusClient(config(), fakeFetch);
  assert.deepEqual(await client.complete("system", "user"), brief);
  assert.equal(captured.url, "https://api.publicai.co/v1/chat/completions");
  assert.equal(captured.options.headers.authorization, "Bearer test-only");
  assert.equal(JSON.parse(captured.options.body).model, "swiss-ai/apertus-v1.5-8b");
});

test("rejects oversized or malformed model responses", async () => {
  const malformed = new ApertusClient(config(), async () => new Response("not-json", { status: 200 }));
  await assert.rejects(() => malformed.complete("system", "user"), (error) => error.code === "invalid_model_response");
  const oversized = new ApertusClient(config(), async () => new Response("x", { status: 200, headers: { "content-length": "1048577" } }));
  await assert.rejects(() => oversized.complete("system", "user"), (error) => error.code === "model_response_too_large");
});
