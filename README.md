# CiteOps

CiteOps turns untrusted operational logs into evidence-gated incident briefs
with Apertus. Every hypothesis and recommended action must cite event IDs that
exist in the submitted log bundle; uncited or invented evidence is rejected
before a response reaches the operator.

This is a new submission for **Hack Apertus Track 2B**. The project code and
submission material live in [`track_2b/`](track_2b/README.md), as required by
the official template.

## Judge quickstart

Set the three official model variables, then run the project from this
repository root:

```bash
export LLM_NAME=swiss-ai/apertus-v1.5-8b
export LLM_BASE_URL=https://api.publicai.co/v1
export LLM_API_KEY=replace-me
make run
```

Open <http://localhost:8080>. The same container can target a private
OpenAI-compatible Apertus endpoint on an on-premise or air-gapped network.

For a clearly labeled UI-only preview without model inference:

```bash
CITEOPS_FIXTURE_MODE=1 make run
```

Fixture mode is not an Apertus evaluation result and is never enabled by
default.

## Repository map

- `track_2b/src/`: application, validation, redaction, and model adapter
- `track_2b/public/`: operator interface
- `track_2b/data/`: synthetic evaluation cases
- `track_2b/docs/`: architecture and threat model
- `track_2b/test/`: regression and HTTP integration tests
- `track_2b/technical_report.md`: submission report source

## License

Apache-2.0 for the software. The technical report is CC-BY-4.0 as required by
the template.
