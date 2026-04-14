const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "uns",
  "umas",
  "de",
  "da",
  "das",
  "do",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "por",
  "com",
  "sem",
  "sobre",
  "sob",
  "ao",
  "aos",
  "ou",
  "que",
  "se",
  "como",
  "mais",
  "menos",
  "muito",
  "muita",
  "muitos",
  "muitas",
  "ja",
  "já",
  "ser",
  "estar",
  "ter",
  "tem",
  "foi",
  "sao",
  "são",
  "nao",
  "não",
  "me",
  "te",
  "lhe",
  "eles",
  "elas",
  "isso",
  "isto",
  "esse",
  "essa",
  "pra",
  "pro",
  "vou",
  "quero",
  "preciso",
  "pode",
  "poder",
  "ajudar",
  "kiara",
]);

function normalizeText(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function extractSearchTerms(text, { limit = 24 } = {}) {
  const tokens = normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token && token.length >= 2 && !STOPWORDS.has(token));

  return [...new Set(tokens)].slice(0, limit);
}

export function scoreTextMatch(text, query, { recencyBoost = 0, timestamp } = {}) {
  const haystack = normalizeText(text);
  const terms = Array.isArray(query) ? query : extractSearchTerms(query);
  if (!haystack || !terms.length) return 0;

  let score = 0;
  for (const term of terms) {
    if (!haystack.includes(term)) continue;
    score += term.length >= 6 ? 3 : 2;
  }

  const normalizedQuery = terms.join(" ");
  if (normalizedQuery && haystack.includes(normalizedQuery)) {
    score += 4;
  }

  if (timestamp) {
    const ageMs = Math.max(0, Date.now() - Number(timestamp));
    const ageDays = ageMs / 86_400_000;
    score += Math.max(0, recencyBoost - Math.min(recencyBoost, ageDays / 7));
  }

  return score;
}
