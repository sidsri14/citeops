import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { CiteOpsService } from "./service.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const cases = JSON.parse(await readFile(join(DATA, "evaluation_cases.json"), "utf8"));
const config = loadConfig({ ...process.env, CITEOPS_FIXTURE_MODE: "0" });
if (!config.modelApiKey) {
  console.error("LLM_API_KEY is required. Evaluation never runs in fixture mode.");
  process.exitCode = 2;
} else {
  const service = new CiteOpsService(config);
  const responses = [];
  let valid = 0;
  for (const testCase of cases) {
    const started = performance.now();
    try {
      const response = await service.createBrief(testCase.input);
      valid += 1;
      responses.push({ id: testCase.id, latency_ms: Number((performance.now() - started).toFixed(1)), response });
    } catch (error) {
      responses.push({ id: testCase.id, latency_ms: Number((performance.now() - started).toFixed(1)), error: { code: error.code || "error", message: error.message } });
    }
  }
  const results = {
    generated_at: new Date().toISOString(),
    model: config.modelName,
    endpoint_origin: config.modelBaseUrl.origin,
    cases: cases.length,
    schema_and_citation_passes: valid,
    schema_and_citation_pass_rate: cases.length ? valid / cases.length : 0,
  };
  await writeFile(join(DATA, "model_responses.json"), `${JSON.stringify(responses, null, 2)}\n`, { flag: "wx" });
  await writeFile(join(DATA, "evaluation_results.json"), `${JSON.stringify(results, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify(results, null, 2));
}
