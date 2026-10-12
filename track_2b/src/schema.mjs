import { CiteOpsError } from "./errors.mjs";

const ROOT_KEYS = ["events", "request_id", "service"];
const EVENT_KEYS = ["id", "level", "message", "timestamp"];
const BRIEF_KEYS = ["actions", "hypotheses", "incident_title", "severity", "summary", "unknowns"];
const HYPOTHESIS_KEYS = ["claim", "confidence", "evidence_ids"];
const ACTION_KEYS = ["action", "evidence_ids", "risk"];
const LEVELS = new Set(["debug", "info", "warn", "error", "critical"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const RATINGS = new Set(["low", "medium", "high"]);

function fail(message, code = "invalid_input") {
  throw new CiteOpsError(message, { status: 422, code });
}

function assertObject(value, label, code = "invalid_input") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`, code);
}

function assertExactKeys(value, expected, label, code = "invalid_input") {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} must contain exactly: ${wanted.join(", ")}.`, code);
  }
}

function cleanString(value, label, { min = 1, max = 1000, pattern, code = "invalid_input" } = {}) {
  if (typeof value !== "string") fail(`${label} must be a string.`, code);
  const clean = value.trim();
  if (clean.length < min || clean.length > max) fail(`${label} must contain ${min}-${max} characters.`, code);
  if (pattern && !pattern.test(clean)) fail(`${label} has an invalid format.`, code);
  return clean;
}

export function validateIncidentInput(value) {
  assertObject(value, "request");
  assertExactKeys(value, ROOT_KEYS, "request");
  const requestId = cleanString(value.request_id, "request_id", {
    max: 80,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  });
  const service = cleanString(value.service, "service", {
    max: 100,
    pattern: /^[A-Za-z0-9][A-Za-z0-9 ._\/-]*$/,
  });
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 50) {
    fail("events must contain 1-50 log events.");
  }

  let totalMessageSize = 0;
  const ids = new Set();
  const events = value.events.map((event, index) => {
    assertObject(event, `events[${index}]`);
    assertExactKeys(event, EVENT_KEYS, `events[${index}]`);
    const id = cleanString(event.id, `events[${index}].id`, {
      max: 80,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    });
    if (ids.has(id)) fail(`Duplicate event ID: ${id}.`);
    ids.add(id);
    const timestamp = cleanString(event.timestamp, `events[${index}].timestamp`, { max: 40 });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
      fail(`events[${index}].timestamp must be an ISO-8601 timestamp with a timezone.`);
    }
    const level = cleanString(event.level, `events[${index}].level`, { max: 8 }).toLowerCase();
    if (!LEVELS.has(level)) fail(`events[${index}].level is not supported.`);
    const message = cleanString(event.message, `events[${index}].message`, { max: 1000 });
    totalMessageSize += message.length;
    return { id, timestamp, level, message };
  });
  if (totalMessageSize > 20_000) fail("Combined event messages must not exceed 20,000 characters.");
  return Object.freeze({ request_id: requestId, service, events });
}

function validateCitedItems(items, label, textKey, ratingKey, keys, eventIds) {
  if (!Array.isArray(items) || items.length > 12) fail(`${label} must be an array with at most 12 items.`, "invalid_model_output");
  return items.map((item, index) => {
    assertObject(item, `${label}[${index}]`, "invalid_model_output");
    assertExactKeys(item, keys, `${label}[${index}]`, "invalid_model_output");
    const text = cleanString(item[textKey], `${label}[${index}].${textKey}`, { max: 800, code: "invalid_model_output" });
    const rating = cleanString(item[ratingKey], `${label}[${index}].${ratingKey}`, { max: 6, code: "invalid_model_output" }).toLowerCase();
    if (!RATINGS.has(rating)) fail(`${label}[${index}].${ratingKey} is invalid.`, "invalid_model_output");
    if (!Array.isArray(item.evidence_ids) || item.evidence_ids.length < 1 || item.evidence_ids.length > 12) {
      fail(`${label}[${index}].evidence_ids must contain 1-12 event IDs.`, "invalid_model_output");
    }
    const evidenceIds = [...new Set(item.evidence_ids.map((id) => cleanString(id, `${label}[${index}].evidence_ids`, { max: 80, code: "invalid_model_output" })))];
    for (const id of evidenceIds) {
      if (!eventIds.has(id)) fail(`${label}[${index}] cites unknown event ID: ${id}.`, "invalid_model_output");
    }
    return { [textKey]: text, evidence_ids: evidenceIds, [ratingKey]: rating };
  });
}

export function validateBriefOutput(value, inputEvents) {
  assertObject(value, "model output", "invalid_model_output");
  assertExactKeys(value, BRIEF_KEYS, "model output", "invalid_model_output");
  const eventIds = new Set(inputEvents.map((event) => event.id));
  const severity = cleanString(value.severity, "severity", { max: 8, code: "invalid_model_output" }).toLowerCase();
  if (!SEVERITIES.has(severity)) fail("severity is invalid.", "invalid_model_output");
  if (!Array.isArray(value.unknowns) || value.unknowns.length > 12) fail("unknowns must be an array with at most 12 items.", "invalid_model_output");

  return {
    incident_title: cleanString(value.incident_title, "incident_title", { max: 160, code: "invalid_model_output" }),
    severity,
    summary: cleanString(value.summary, "summary", { max: 1200, code: "invalid_model_output" }),
    hypotheses: validateCitedItems(value.hypotheses, "hypotheses", "claim", "confidence", HYPOTHESIS_KEYS, eventIds),
    actions: validateCitedItems(value.actions, "actions", "action", "risk", ACTION_KEYS, eventIds),
    unknowns: value.unknowns.map((unknown, index) => cleanString(unknown, `unknowns[${index}]`, { max: 500, code: "invalid_model_output" })),
  };
}
