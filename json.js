export function extractJsonObject(text) {
  if (typeof text !== "string") return null;

  const cleaned = text.replace(/```json|```/gi, "").trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;

  const candidate = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

