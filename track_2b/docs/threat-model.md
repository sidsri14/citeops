# Threat model

## Protected assets

- credentials and personal identifiers inside submitted log messages
- integrity of incident hypotheses and recommended actions
- availability of the operator-facing service
- model endpoint credentials

## Addressed threats

| Threat | Control |
| --- | --- |
| Prompt injection inside logs | Logs are JSON-encoded under an explicit untrusted-data instruction; model has no tools |
| Secret disclosure to the model | Local pattern-based redaction before prompt construction |
| Invented evidence | Every cited ID is checked against the submitted event set |
| Uncited recommendation | Every hypothesis and action requires at least one citation |
| Schema smuggling | Exact keys at every input and output object; extra fields fail |
| Oversized payloads | 64 KiB HTTP body, 50 events, 20k message characters, 1 MiB model response |
| Duplicate execution | Request-ID fingerprinting and promise singleflight |
| Conflicting replay | Same request ID with different content returns HTTP 409 |
| DNS rebinding | Host allow-list plus private/local host policy |
| Browser cross-origin submission | Same-host Origin check for POST |
| Insecure remote inference | HTTPS required except for local/private endpoints |
| Container privilege escalation | Non-root user, dropped capabilities, read-only root, no-new-privileges |

## Residual risks

- Pattern redaction is intentionally conservative but cannot recognize every
  proprietary secret format. Deployments should add organisation-specific
  detectors before production use.
- A valid citation proves that an event exists, not that the model's causal
  interpretation is correct. Operators must review low-confidence claims.
- Request deduplication is process-local and bounded to 1,000 entries. A
  multi-replica production deployment needs a shared idempotency store.
- CiteOps does not authenticate users or implement role-based access control in
  this prototype. Keep it behind an organisation's existing identity-aware
  proxy.
- The hosted demo path sends redacted logs outside the operator's network. Use
  private Apertus serving for sensitive operations.
