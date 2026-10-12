import { CiteOpsError } from "./errors.mjs";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function parseBoolean(value) {
  return TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function parsePort(value) {
  const port = Number(value ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CiteOpsError("PORT must be an integer from 1 to 65535.", {
      status: 500,
      code: "invalid_configuration",
    });
  }
  return port;
}

function parseTimeout(value) {
  const timeout = Number(value ?? 45_000);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new CiteOpsError("LLM_TIMEOUT_MS must be an integer from 1000 to 120000.", {
      status: 500,
      code: "invalid_configuration",
    });
  }
  return timeout;
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function isLocalOrPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    host === "localhost" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:") ||
    isPrivateIpv4(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".")
  );
}

export function validateModelBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CiteOpsError("LLM_BASE_URL must be a valid URL.", {
      status: 500,
      code: "invalid_configuration",
    });
  }

  if (url.username || url.password) {
    throw new CiteOpsError("LLM_BASE_URL must not contain credentials.", {
      status: 500,
      code: "invalid_configuration",
    });
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalOrPrivateHost(url.hostname))) {
    throw new CiteOpsError("Remote model endpoints must use HTTPS; HTTP is allowed only for local or private hosts.", {
      status: 500,
      code: "invalid_configuration",
    });
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function loadConfig(env = process.env) {
  const fixtureMode = parseBoolean(env.CITEOPS_FIXTURE_MODE);
  const baseUrl = validateModelBaseUrl(env.LLM_BASE_URL || "http://127.0.0.1:8000/v1");
  const modelName = env.LLM_NAME || "swiss-ai/apertus-v1.5-8b";
  if (!/apertus/i.test(modelName)) {
    throw new CiteOpsError("LLM_NAME must identify a model in the Apertus family.", {
      status: 500,
      code: "invalid_configuration",
    });
  }
  const allowedHosts = new Set(
    (env.CITEOPS_ALLOWED_HOSTS || "localhost,127.0.0.1,[::1],citeops")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );

  return Object.freeze({
    port: parsePort(env.PORT),
    host: env.HOST || "0.0.0.0",
    modelName,
    modelBaseUrl: baseUrl,
    modelApiKey: env.LLM_API_KEY || "",
    modelTimeoutMs: parseTimeout(env.LLM_TIMEOUT_MS),
    fixtureMode,
    allowedHosts,
    userAgent: "CiteOps/0.1 (+https://github.com/sidsri14/citeops)",
  });
}
