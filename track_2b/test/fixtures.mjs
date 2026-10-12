export const incident = {
  request_id: "req-001",
  service: "payments-api",
  events: [
    { id: "evt-1", timestamp: "2026-10-12T10:00:00Z", level: "warn", message: "Dependency latency exceeded 1500ms." },
    { id: "evt-2", timestamp: "2026-10-12T10:00:02Z", level: "error", message: "POST /pay returned 502." },
  ],
};

export const brief = {
  incident_title: "Payment dependency timeout",
  severity: "high",
  summary: "The payment request failed after dependency latency increased.",
  hypotheses: [{ claim: "An upstream dependency timed out.", evidence_ids: ["evt-1", "evt-2"], confidence: "high" }],
  actions: [{ action: "Inspect upstream latency before retrying traffic.", evidence_ids: ["evt-1"], risk: "low" }],
  unknowns: ["The upstream provider response is unavailable."],
};

export function config(overrides = {}) {
  return {
    port: 8080,
    host: "127.0.0.1",
    modelName: "swiss-ai/apertus-v1.5-8b",
    modelBaseUrl: new URL("https://api.publicai.co/v1/"),
    modelApiKey: "test-only",
    modelTimeoutMs: 1000,
    fixtureMode: false,
    allowedHosts: new Set(["localhost", "127.0.0.1", "[::1]", "citeops"]),
    userAgent: "CiteOps/test",
    ...overrides,
  };
}
