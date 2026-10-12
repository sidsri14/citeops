import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalOrPrivateHost, loadConfig } from "./config.mjs";
import { asPublicError, CiteOpsError } from "./errors.mjs";
import { CiteOpsService } from "./service.mjs";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const MAX_BODY_BYTES = 65_536;
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

function securityHeaders(contentType) {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function writeJson(response, status, body) {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    ...securityHeaders("application/json; charset=utf-8"),
    "content-length": Buffer.byteLength(data),
  });
  response.end(data);
}

function requestHostname(request) {
  const host = request.headers.host;
  if (!host || /[\s/@]/.test(host)) return "";
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function assertRequestHost(request, config) {
  const hostname = requestHostname(request);
  if (!hostname || (!config.allowedHosts.has(hostname) && !isLocalOrPrivateHost(hostname))) {
    throw new CiteOpsError("Request host is not allowed.", { status: 403, code: "forbidden_host" });
  }
}

function assertRequestOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new CiteOpsError("Request origin is invalid.", { status: 403, code: "forbidden_origin" });
  }
  if (parsed.host.toLowerCase() !== String(request.headers.host || "").toLowerCase()) {
    throw new CiteOpsError("Cross-origin requests are not allowed.", { status: 403, code: "forbidden_origin" });
  }
}

async function readJsonBody(request) {
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new CiteOpsError("Content-Type must be application/json.", { status: 415, code: "unsupported_media_type" });
  }
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > MAX_BODY_BYTES) {
    throw new CiteOpsError("Request body exceeds 64 KiB.", { status: 413, code: "request_too_large" });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new CiteOpsError("Request body exceeds 64 KiB.", { status: 413, code: "request_too_large" });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (cause) {
    throw new CiteOpsError("Request body must contain valid JSON.", { status: 400, code: "invalid_json", cause });
  }
}

async function serveStatic(pathname, response) {
  const entry = STATIC_FILES.get(pathname);
  if (!entry) return false;
  const [filename, contentType] = entry;
  const path = join(PUBLIC_DIR, filename);
  const metadata = await stat(path);
  response.writeHead(200, {
    ...securityHeaders(contentType),
    "content-length": metadata.size,
  });
  createReadStream(path).pipe(response);
  return true;
}

export function createServer(config = loadConfig(), { service = new CiteOpsService(config) } = {}) {
  return createHttpServer(async (request, response) => {
    try {
      assertRequestHost(request, config);
      const url = new URL(request.url || "/", "http://citeops.local");
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, {
          status: "ok",
          model: config.modelName,
          model_configured: Boolean(config.modelApiKey),
          fixture_mode: config.fixtureMode,
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/briefs") {
        assertRequestOrigin(request);
        const body = await readJsonBody(request);
        writeJson(response, 200, await service.createBrief(body));
        return;
      }
      if (request.method === "GET" && await serveStatic(url.pathname, response)) return;
      writeJson(response, 404, { error: { code: "not_found", message: "Route not found." } });
    } catch (error) {
      const publicError = asPublicError(error);
      writeJson(response, publicError.status, publicError.body);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const server = createServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`CiteOps listening on http://${config.host}:${config.port}`);
    console.log(config.fixtureMode ? "Fixture preview mode: Apertus inference is disabled." : `Model: ${config.modelName}`);
  });
}
