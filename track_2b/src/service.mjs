import { createHash } from "node:crypto";
import { ApertusClient } from "./apertus_client.mjs";
import { CiteOpsError } from "./errors.mjs";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt.mjs";
import { redactEvents } from "./redact.mjs";
import { validateBriefOutput, validateIncidentInput } from "./schema.mjs";

function fingerprint(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function fixtureBrief(input) {
  const highest = input.events.find((event) => event.level === "critical")
    ?? input.events.find((event) => event.level === "error")
    ?? input.events[0];
  return {
    incident_title: `${input.service} incident preview`,
    severity: highest.level === "critical" ? "critical" : highest.level === "error" ? "high" : "medium",
    summary: "Fixture preview generated without model inference. Configure Apertus before evaluation.",
    hypotheses: [{ claim: "The selected event is the strongest available failure signal.", evidence_ids: [highest.id], confidence: "low" }],
    actions: [{ action: "Inspect the cited event and its upstream dependency before changing production state.", evidence_ids: [highest.id], risk: "low" }],
    unknowns: ["Fixture mode does not perform semantic incident analysis."],
  };
}

export class CiteOpsService {
  constructor(config, { client = new ApertusClient(config), maxRequests = 1000 } = {}) {
    this.config = config;
    this.client = client;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  createBrief(rawInput) {
    const input = validateIncidentInput(rawInput);
    const digest = fingerprint(input);
    const existing = this.requests.get(input.request_id);
    if (existing) {
      if (existing.fingerprint !== digest) {
        throw new CiteOpsError("request_id was already used with different incident data.", {
          status: 409,
          code: "request_id_conflict",
        });
      }
      return existing.promise;
    }

    if (this.requests.size >= this.maxRequests) {
      this.requests.delete(this.requests.keys().next().value);
    }
    const promise = this.#create(input);
    this.requests.set(input.request_id, { fingerprint: digest, promise });
    promise.catch(() => {
      if (this.requests.get(input.request_id)?.promise === promise) this.requests.delete(input.request_id);
    });
    return promise;
  }

  async #create(input) {
    const redacted = redactEvents(input.events);
    let rawBrief;
    let inferenceMode;
    let apertusUsed;
    if (this.config.fixtureMode) {
      rawBrief = fixtureBrief({ ...input, events: redacted.events });
      inferenceMode = "fixture-preview";
      apertusUsed = false;
    } else {
      rawBrief = await this.client.complete(SYSTEM_PROMPT, buildPrompt({ ...input, events: redacted.events }));
      inferenceMode = "apertus";
      apertusUsed = true;
    }
    const brief = validateBriefOutput(rawBrief, redacted.events);
    return {
      request_id: input.request_id,
      service: input.service,
      model: this.config.modelName,
      inference_mode: inferenceMode,
      apertus_used: apertusUsed,
      redactions: redacted.count,
      brief,
    };
  }
}
