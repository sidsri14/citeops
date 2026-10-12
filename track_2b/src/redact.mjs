const PATTERNS = [
  { expression: /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, replacement: () => "Bearer [REDACTED]" },
  { expression: /\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{12,}\b/g, replacement: () => "[REDACTED_API_KEY]" },
  { expression: /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key)[A-Za-z0-9_.-]*)\s*[:=]\s*([^\s,;]+)/gi, replacement: (_match, key) => `${key}=[REDACTED]` },
  { expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: () => "[REDACTED_EMAIL]" },
];

export function redactText(value) {
  let text = String(value);
  let count = 0;
  for (const { expression, replacement } of PATTERNS) {
    text = text.replace(expression, (...args) => {
      count += 1;
      return replacement(...args);
    });
  }
  return { text, count };
}

export function redactEvents(events) {
  let count = 0;
  const redacted = events.map((event) => {
    const result = redactText(event.message);
    count += result.count;
    return { ...event, message: result.text };
  });
  return { events: redacted, count };
}
