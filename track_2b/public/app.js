const sample = {
  request_id: "checkout-2026-10-12-001",
  service: "checkout-api",
  events: [
    { id: "evt-101", timestamp: "2026-10-12T09:31:04Z", level: "warn", message: "Payment provider latency crossed 1800ms for region eu-central." },
    { id: "evt-102", timestamp: "2026-10-12T09:31:09Z", level: "error", message: "POST /checkout returned 502 after upstream timeout; trace=8f12." },
    { id: "evt-103", timestamp: "2026-10-12T09:31:14Z", level: "info", message: "Circuit breaker opened after 5 consecutive failures." },
  ],
};

const input = document.querySelector("#incident-json");
const generate = document.querySelector("#generate");
const reset = document.querySelector("#load-sample");
const result = document.querySelector("#result");
const errorBox = document.querySelector("#error");
const empty = document.querySelector("#empty-state");
const badge = document.querySelector("#mode-badge");

function loadSample() { input.value = JSON.stringify(sample, null, 2); }
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
function cards(items, textKey, ratingKey) {
  if (!items.length) return '<p class="hint">No supported items returned.</p>';
  return items.map((item) => `<article class="card"><p>${escapeHtml(item[textKey])}</p><span class="evidence">${escapeHtml(item.evidence_ids.join(" / "))} &middot; ${escapeHtml(ratingKey)} ${escapeHtml(item[ratingKey])}</span></article>`).join("");
}
function render(data) {
  const brief = data.brief;
  badge.textContent = data.apertus_used ? "Apertus verified" : "Fixture preview";
  badge.className = `badge ${data.apertus_used ? "ok" : "preview"}`;
  result.innerHTML = `
    <h3>${escapeHtml(brief.incident_title)}</h3>
    <p class="summary">${escapeHtml(brief.summary)}</p>
    <div class="meta"><span class="badge">${escapeHtml(brief.severity)} severity</span><span class="badge">${Number(data.redactions)} redactions</span><span class="badge">${escapeHtml(data.model)}</span></div>
    <p class="section-title">Supported hypotheses</p>${cards(brief.hypotheses, "claim", "confidence")}
    <p class="section-title">Bounded actions</p>${cards(brief.actions, "action", "risk")}
    <p class="section-title">Unknowns</p><ul class="unknowns">${brief.unknowns.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  empty.hidden = true;
  errorBox.hidden = true;
  result.hidden = false;
}

reset.addEventListener("click", loadSample);
generate.addEventListener("click", async () => {
  generate.disabled = true;
  generate.textContent = "Validating and analyzing...";
  errorBox.hidden = true;
  try {
    const payload = JSON.parse(input.value);
    const response = await fetch("/api/briefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Request failed with HTTP ${response.status}.`);
    render(data);
  } catch (error) {
    result.hidden = true;
    empty.hidden = true;
    errorBox.textContent = error instanceof SyntaxError ? "The incident bundle is not valid JSON." : error.message;
    errorBox.hidden = false;
    badge.textContent = "Rejected";
    badge.className = "badge";
  } finally {
    generate.disabled = false;
    generate.textContent = "Generate verified brief";
  }
});

loadSample();
