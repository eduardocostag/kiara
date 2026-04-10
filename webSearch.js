import fetch from "node-fetch";

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function duckDuckGoSearch(query, { limit = 5 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      accept: "text/html",
    },
  });

  const html = await res.text();

  const results = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const snippets = [];
  let m2;
  while ((m2 = snippetRe.exec(html))) {
    snippets.push(stripTags(m2[1]));
    if (snippets.length >= 20) break;
  }

  let m;
  while ((m = linkRe.exec(html))) {
    const href = safeUrl(m[1]);
    const title = stripTags(m[2]);
    if (!href || !title) continue;
    results.push({
      title,
      url: href,
      snippet: snippets[results.length] || "",
    });
    if (results.length >= limit) break;
  }

  return results;
}

