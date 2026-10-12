# Technical report - CiteOps

- **Track:** Track 2B - Own Project
- **Event:** Hack Apertus 2026 Online Hackathon
- **Team:** Siddharth Srivastava
- **Repository:** https://github.com/sidsri14/citeops
- **Demo:** To be recorded after real Apertus validation

## 1. Summary

CiteOps is a sovereign incident-analysis gateway that uses Apertus to transform
bounded operational log events into a structured incident brief. Its central
design rule is that generative output cannot authorize its own evidence: every
hypothesis and action must cite IDs from the submitted event set, and
deterministic code rejects unsupported citations, missing citations, or schema
extensions. Credentials and email addresses are redacted locally before model
inference. The current implementation has zero runtime npm dependencies, runs
as a non-root read-only container, and can target either a hosted demonstration
endpoint or an on-premise OpenAI-compatible Apertus server.

## 2. Problem and design

Operational logs are useful context for language models but form a hostile
input boundary. They can contain credentials, personal information, and text
controlled by an attacker. Generic completions can also invent a root cause or
recommend an action that has no supporting event.

CiteOps separates semantic analysis from deterministic authority:

1. The gateway accepts exactly `request_id`, `service`, and 1-50 events.
2. Each event is validated; total message text is capped at 20,000 characters.
3. Common credential assignments, bearer tokens, API keys, and emails are
   replaced locally.
4. Apertus receives JSON-encoded events under an explicit untrusted-data
   instruction and returns a candidate six-field JSON brief.
5. Exact-key validators check types, lengths, enums, and collection bounds.
6. An evidence gate requires every hypothesis and action to cite at least one
   submitted event ID. Unknown IDs fail closed with HTTP 502.

The prototype has no command execution, tool calling, URL fetching, or
operational side effects. It supports human decision-making; it does not act on
infrastructure.

## 3. Architecture and sovereign deployment

The data path is shown in `docs/architecture.md`:

`browser -> validation -> local redaction -> Apertus -> schema gate -> citation gate -> operator`

The mandatory target architecture is **on-premise**, with **air-gapped runtime**
also possible after the container image and Apertus weights are staged.
`LLM_BASE_URL` points to an OpenAI-compatible Apertus service on the private
network. The application UI is packaged in the same container and loads no
external scripts, fonts, analytics, or telemetry. Plain HTTP is accepted only
for loopback, RFC1918/link-local addresses, and local/internal hostnames;
external endpoints require HTTPS.

The demonstration can use Public AI's hosted Apertus endpoint. That path is
clearly weaker for sovereignty even though redaction occurs before transport.
It exists to make the prototype reviewable, not to redefine the target
architecture.

Container controls include an unprivileged user, read-only root filesystem,
dropped Linux capabilities, `no-new-privileges`, a small `tmpfs`, and a health
check. Runtime has zero third-party npm packages. The model service and Docker
base image are build/deployment dependencies; neither is contacted by the
application unless explicitly configured.

## 4. Use of Apertus

- **Model:** `swiss-ai/apertus-v1.5-8b`
- **Task:** structured incident summarisation, hypothesis formation, action
  suggestion, and explicit uncertainty reporting
- **Interface:** OpenAI-compatible `/v1/chat/completions`
- **Serving:** hosted HTTPS endpoint for the demo; configurable private endpoint
  for the target deployment
- **Decoding:** temperature 0

The system prompt defines logs as untrusted data and requires exact JSON keys,
bounded severity/confidence/risk enums, and copied event IDs. Prompt compliance
alone is not trusted: every constraint is checked again in application code.
The model never receives its endpoint API key in prompt content, and the server
does not log request bodies or model responses.

Fixture mode generates one deterministic preview for UI review. It is visibly
marked `fixture-preview`, returns `apertus_used: false`, and is programmatically
disabled by the evaluation runner. No fixture output is reported as model
performance.

## 5. Data and evaluation

The repository contains five synthetic cases authored for this project under
`data/evaluation_cases.json`: dependency timeout, database pool exhaustion,
secret-bearing logs, prompt injection inside a log, and insufficient evidence.
They contain no production or personal data. The project does not train or
fine-tune the model.

Two layers are evaluated separately:

1. **Deterministic acceptance layer:** regression tests cover exact schemas,
   unknown and missing citations, duplicate event IDs, secret redaction,
   log-borne prompt injection, request singleflight/conflicts, HTTPS rules,
   response bounds, HTTP body bounds, Host validation, Origin validation, and
   fixture labeling.
2. **Apertus generation layer:** `npm run evaluate` calls the configured model
   over all five cases and records latency plus the percentage of raw model
   completions that pass schema and evidence validation. The runner refuses to
   operate in fixture mode and will not overwrite a prior result silently.

| Setup | Metric | Current result |
| --- | --- | --- |
| Node 24 local | Behavioral regression cases | 19/19 passing |
| npm dependency audit | Known package vulnerabilities | 0 |
| Docker judge path | Build, health check, cited API smoke | Passed ([CI run 38239291460](https://github.com/sidsri14/citeops/actions/runs/38239291460)) |
| Apertus v1.5 8B | Schema-and-citation pass rate on 5 cases | Pending real endpoint key |

The pending cells are deliberate. They will be replaced only by captured CI or
real Apertus results before submission; no synthetic performance number is
used.

## 6. Security and failure semantics

The main threat model is in `docs/threat-model.md`. Notable properties are:

- An invalid model response fails closed; CiteOps does not silently invent
  citations or repair unsupported claims.
- Model responses are capped at 1 MiB and inference has a deadline.
- Request IDs are content-fingerprinted. Concurrent identical requests share
  one promise; conflicting reuse returns HTTP 409.
- Failed model calls are removed from the idempotency map so a transient outage
  does not permanently poison a request ID.
- Browser POSTs require a same-host Origin when Origin is present. Host headers
  must be explicitly allowed or local/private to reduce DNS-rebinding risk.

## 7. Limitations

Pattern-based redaction cannot recognize every organisation-specific secret
format. A production deployment needs custom detectors and its existing
identity-aware access layer. A valid event citation proves that evidence exists,
not that the model's causal interpretation is correct. Operators must review
claims, especially low-confidence ones. Idempotency state is bounded and
process-local; multiple replicas need a shared store. There is no RBAC, durable
incident history, SIEM connector, streaming inference, or automatic remediation
in this hackathon prototype.

Docker is unavailable on the development workstation, so the container path was
independently built and smoke-tested in GitHub Actions at commit `54bf286`. The
hosted Apertus API key has not been issued, so neither local tests nor container
CI prove the real inference path. Captured evaluation artifacts remain the
required evidence for that boundary.

## 8. Reproducibility and next steps

Judges set `LLM_NAME`, `LLM_BASE_URL`, and `LLM_API_KEY`, then run `make run`
from the repository root. The compose service exposes port 8080. `npm test`,
`npm run check`, and `npm audit` reproduce local software checks. `npm run
evaluate` creates response and aggregate-result files using exclusive creation.
The final report will record the evaluated commit SHA, Node version, endpoint
origin, and CI URL.

With another month, the most useful additions would be organisation-specific
redaction policies, authenticated access, durable audit history, a shared
idempotency store, human feedback labels, and connectors that import evidence
from a SIEM without giving the model any remediation capability.

## License

Software: Apache License 2.0. Report: Creative Commons Attribution 4.0
(CC-BY-4.0).

## References

1. Swiss AI Initiative, Apertus v1.5 model family, https://huggingface.co/swiss-ai/Apertus-v1.5-8B
2. Hack Apertus, Track 2B project requirements, https://hackapertus.notion.site/track-2-apertus-adoption
3. Public AI, OpenAI-compatible API documentation, https://platform.publicai.co/docs
