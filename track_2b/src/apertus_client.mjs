import { CiteOpsError } from "./errors.mjs";

const MAX_RESPONSE_BYTES = 1_048_576;

async function readLimitedText(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) {
    throw new CiteOpsError("Model response exceeded the size limit.", { status: 502, code: "model_response_too_large" });
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new CiteOpsError("Model response exceeded the size limit.", { status: 502, code: "model_response_too_large" });
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function extractJson(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(clean);
  } catch (cause) {
    throw new CiteOpsError("Apertus returned invalid JSON.", {
      status: 502,
      code: "invalid_model_output",
      cause,
    });
  }
}

export class ApertusClient {
  constructor(config, fetchImplementation = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImplementation;
  }

  async complete(systemPrompt, userPrompt) {
    if (!this.config.modelApiKey) {
      throw new CiteOpsError("LLM_API_KEY is required for Apertus inference.", {
        status: 503,
        code: "model_not_configured",
      });
    }
    const endpoint = new URL("chat/completions", this.config.modelBaseUrl);
    let response;
    try {
      response = await this.fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.modelApiKey}`,
          "content-type": "application/json",
          "user-agent": this.config.userAgent,
        },
        body: JSON.stringify({
          model: this.config.modelName,
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(this.config.modelTimeoutMs),
        redirect: "error",
      });
    } catch (cause) {
      const timeout = cause?.name === "TimeoutError";
      throw new CiteOpsError(timeout ? "Apertus inference timed out." : "Apertus endpoint was unavailable.", {
        status: 502,
        code: timeout ? "model_timeout" : "model_unavailable",
        cause,
      });
    }

    const bodyText = await readLimitedText(response);
    if (!response.ok) {
      throw new CiteOpsError(`Apertus endpoint returned HTTP ${response.status}.`, {
        status: 502,
        code: "model_upstream_error",
      });
    }
    if (!String(response.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      throw new CiteOpsError("Apertus endpoint returned a non-JSON content type.", {
        status: 502,
        code: "invalid_model_response",
      });
    }

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (cause) {
      throw new CiteOpsError("Apertus endpoint returned malformed JSON.", {
        status: 502,
        code: "invalid_model_response",
        cause,
      });
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new CiteOpsError("Apertus endpoint returned no completion content.", {
        status: 502,
        code: "invalid_model_response",
      });
    }
    return extractJson(content);
  }
}
