# CiteOps - evidence-gated incident briefs with Apertus

CiteOps is a sovereign incident-analysis gateway for operators who need useful
LLM assistance without accepting uncited claims. It sends a bounded, locally
redacted event bundle to Apertus, accepts only a strict JSON brief, and rejects
every hypothesis or action that does not cite a real input event ID.

**Track:** Hack Apertus 2026, Track 2B (Own Project)

**Demo:** [54-second narrated walkthrough](output/video/CiteOps_HackApertus_Demo.mp4)

**Technical report:** [five-page PDF](output/pdf/SiddharthSrivastava_Report.pdf)

## Why this exists

Raw incident logs mix useful evidence with secrets, personal identifiers, and
sometimes attacker-controlled strings. A generic chat completion can repeat a
secret, obey an instruction embedded in a log line, or invent a plausible root
cause. CiteOps puts deterministic controls around the model:

1. Validate a maximum of 50 events and 20,000 message characters.
2. Redact bearer tokens, common API keys, credential assignments, and emails.
3. Tell Apertus that log messages are untrusted data.
4. Require a six-field response contract.
5. Reject unknown citations, uncited actions, uncited hypotheses, and extra fields.

The model performs the semantic task. Code owns authorization, bounds, privacy,
and evidence integrity.

## Run with Docker

The official judge path starts at the repository root:

```bash
export LLM_NAME=swiss-ai/apertus-v1.5-8b
export LLM_BASE_URL=https://api.publicai.co/v1
export LLM_API_KEY=replace-me
make run
```

Then open <http://localhost:8080>.

For an on-premise or air-gapped deployment, point `LLM_BASE_URL` at a private
OpenAI-compatible Apertus server such as `http://vllm:8000/v1`. Plain HTTP is
accepted only for loopback, private IPs, and local/internal hostnames; all other
model endpoints require HTTPS.

### UI-only preview

```bash
CITEOPS_FIXTURE_MODE=1 make run
```

The interface visibly labels this as **Fixture preview**, sets
`apertus_used: false`, and never includes it in `npm run evaluate`.

## API

```bash
curl -sS http://localhost:8080/api/briefs \
  -H 'content-type: application/json' \
  -d '{
    "request_id": "incident-001",
    "service": "checkout-api",
    "events": [
      {
        "id": "evt-1",
        "timestamp": "2026-10-12T09:31:09Z",
        "level": "error",
        "message": "POST /checkout returned 502 after upstream timeout"
      }
    ]
  }'
```

The returned `brief.hypotheses[*].evidence_ids` and
`brief.actions[*].evidence_ids` are guaranteed to refer to event IDs in this
request. If the model violates the contract, CiteOps returns a 502 rather than
silently repairing or displaying an unsupported answer.

## Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `LLM_NAME` | Exact Apertus model identifier | `swiss-ai/apertus-v1.5-8b` |
| `LLM_BASE_URL` | OpenAI-compatible endpoint base | local port 8000 |
| `LLM_API_KEY` | Endpoint credential | none |
| `LLM_TIMEOUT_MS` | Inference deadline | `45000` |
| `CITEOPS_FIXTURE_MODE` | Labeled interface preview without inference | `0` |
| `CITEOPS_ALLOWED_HOSTS` | Additional accepted HTTP Host values | local only |

## Develop and test

Node.js 22 or newer is required. The application has zero runtime npm
dependencies.

```bash
npm install
npm test
npm run check
npm audit
```

Run a real, non-fixture evaluation only after configuring Apertus. For local
development, the command also loads an ignored `.env.local` file when present:

```bash
npm run evaluate
```

Evaluation output uses exclusive file creation so an earlier run is not
silently overwritten. Remove the generated result files deliberately before a
new run.

## Sovereign architecture

The application container, model endpoint, and logs can all stay on an
organisation's own network. Runtime has no analytics, CDN, font, telemetry, or
package-service dependency. The container runs as the unprivileged `node` user,
with a read-only filesystem, dropped Linux capabilities, and no-new-privileges.

See [the architecture](docs/architecture.md), [the threat model](docs/threat-model.md),
and [the technical report](technical_report.md).

## Current evidence boundary

- Unit and HTTP integration tests exercise schema, citation, redaction,
  prompt-injection, transport, singleflight, host, origin, and size controls.
- GitHub Actions builds and smoke-tests the Docker path because Docker is not
  installed on the development workstation.
- A real Public AI run using `swiss-ai/apertus-v1.5-8b` passed the strict schema
  and citation gate on 5/5 synthetic cases. The captured responses and
  aggregate result are in `data/model_responses.json` and
  `data/evaluation_results.json`; fixture output is not model evidence.

## License

Apache-2.0. The technical report is CC-BY-4.0.
