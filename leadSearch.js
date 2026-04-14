import fetch from "node-fetch";

function stripTags(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function extractPhones(text) {
  const t = String(text || "");
  const matches = t.match(/(\+?\d[\d\s().-]{7,}\d)/g) || [];
  // normalize a bit
  return uniq(
    matches
      .map((m) => m.replace(/\s+/g, " ").trim())
      .filter((m) => m.replace(/\D/g, "").length >= 8),
  ).slice(0, 3);
}

function extractAddresses(text) {
  const t = String(text || "");
  // very heuristic: look for common address keywords (pt-BR + en)
  const keywords = [
    "rua",
    "avenida",
    "av.",
    "travessa",
    "alameda",
    "rodovia",
    "estrada",
    "bairro",
    "cep",
    "nº",
    "numero",
    "street",
    "st.",
    "avenue",
    "road",
    "rd.",
    "suite",
  ];

  const lower = t.toLowerCase();
  const idx = keywords
    .map((k) => lower.indexOf(k))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];

  if (idx === undefined) return [];

  const slice = t.slice(Math.max(0, idx - 40), Math.min(t.length, idx + 220));
  const cleaned = slice.replace(/\s+/g, " ").trim();
  return cleaned ? [cleaned] : [];
}

function parseOpenedSignal(text) {
  const t = String(text || "");
  const re = /(inaugur\w*|abriu|abertura|novo|nova|recent(e|emente)|lan(ç|c)amento|lan(ç|c)ou|desde)/i;
  const m = re.exec(t);
  if (!m) return { hit: false, year: null, excerpt: "" };

  const start = Math.max(0, m.index - 80);
  const end = Math.min(t.length, m.index + 200);
  const excerpt = t.slice(start, end).replace(/\s+/g, " ").trim();

  const yearMatch = excerpt.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  return { hit: true, year: Number.isFinite(year) ? year : null, excerpt };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const html = await res.text();
  return { status: res.status, html };
}

function bestNameFromTitle(title) {
  const t = String(title || "").trim();
  if (!t) return "";
  return t.replace(/\s*\|\s*.*$/, "").replace(/\s*-\s*.*$/, "").trim();
}

export async function leadSearch({
  query,
  regionHint,
  maxLeads = 10,
  searchFn, // (q)=>[{title,url,snippet}]
  maxPagesToScrape = 6,
  openedAfter, // "YYYY-MM-DD" or "YYYY"
  requireRecentlyOpened = false,
}) {
  if (!searchFn) throw new Error("searchFn ausente");
  const q = String(query || "").trim();
  if (!q) throw new Error("query vazio");

  const finalQuery = regionHint ? `${q} ${regionHint}` : q;
  const results = await searchFn(finalQuery);

  const minYear = openedAfter
    ? (() => {
        const s = String(openedAfter).trim();
        const m = s.match(/\b(20\d{2})\b/);
        return m ? Number(m[1]) : null;
      })()
    : null;

  const leads = [];
  const seen = new Set();
  for (const r of (results || []).slice(0, maxPagesToScrape)) {
    const url = r.url;
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    let html = "";
    let status = 0;
    try {
      const fetched = await fetchHtml(url);
      html = fetched.html;
      status = fetched.status;
    } catch {
      html = "";
      status = 0;
    }

    const text = stripTags([r.title, r.snippet, html].filter(Boolean).join("\n\n"));
    const phones = extractPhones(text);
    const addresses = extractAddresses(text);
    const opened = parseOpenedSignal(text);

    if (requireRecentlyOpened) {
      if (!opened.hit) continue;
      if (minYear && opened.year && opened.year < minYear) continue;
      if (minYear && !opened.year) continue;
    }

    const score = (phones[0] ? 2 : 0) + (addresses[0] ? 1 : 0) + (opened.hit ? 1 : 0) + (opened.year ? 1 : 0);

    leads.push({
      nome: bestNameFromTitle(r.title),
      telefone: phones[0] || "",
      endereco: addresses[0] || "",
      fonte: url,
      httpStatus: status,
      abertura: opened.hit ? { ano: opened.year, evidencias: opened.excerpt } : null,
      score,
    });

    if (leads.length >= Math.max(maxLeads * 2, 10)) break;
  }

  leads.sort((a, b) => (b.score || 0) - (a.score || 0));
  return leads.slice(0, maxLeads);
}
