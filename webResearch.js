import fetch from "node-fetch";
import { duckDuckGoSearch } from "./webSearch.js";

function truncate(text, max = 3200) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n...[TRUNCADO]`;
}

function extractTextFromHtml(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function fetchPageSummary(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  const html = await res.text();
  const text = truncate(extractTextFromHtml(html), 2200);
  return {
    ok: res.ok,
    status: res.status,
    text,
  };
}

export async function deepWebResearch(query, { searchLimit = 8, pageLimit = 4 } = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, result: "Query ausente" };

  const results = await duckDuckGoSearch(q, { limit: Math.max(searchLimit, pageLimit) });
  const selected = results.slice(0, pageLimit);

  const pages = [];
  for (const item of selected) {
    try {
      const page = await fetchPageSummary(item.url);
      pages.push({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        ...page,
      });
    } catch (err) {
      pages.push({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        ok: false,
        status: 0,
        text: `Falha ao ler pagina: ${err?.message || String(err)}`,
      });
    }
  }

  const lines = [
    `PESQUISA PROFUNDA: ${q}`,
    "",
    "RESULTADOS ENCONTRADOS:",
    ...(results.length
      ? results.map((item, index) => `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet || "(sem snippet)"}`)
      : ["(sem resultados)"]),
    "",
    "PAGINAS LIDAS:",
    ...(pages.length
      ? pages.map(
          (page, index) =>
            `${index + 1}. ${page.title}\n   URL: ${page.url}\n   HTTP: ${page.status}\n   RESUMO EXTRAIDO:\n${page.text}`,
        )
      : ["(nenhuma pagina lida)"]),
  ];

  return {
    ok: true,
    result: lines.join("\n\n"),
    sources: pages.map((page) => page.url),
  };
}
