import fetch from "node-fetch";

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sameHost(a, b) {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

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

function pickBetween(text, startRe, endRe) {
  const start = text.search(startRe);
  if (start === -1) return "";
  const after = text.slice(start);
  const end = after.search(endRe);
  return end === -1 ? after : after.slice(0, end);
}

function extractMeta(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const desc = (html.match(/<meta[^>]*name=[\"']description[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>/i)?.[1] || "").trim();
  const canonical = (html.match(/<link[^>]*rel=[\"']canonical[\"'][^>]*href=[\"']([^\"']+)[\"'][^>]*>/i)?.[1] || "").trim();
  const ogTitle = (html.match(/<meta[^>]*property=[\"']og:title[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>/i)?.[1] || "").trim();
  const ogDesc = (html.match(/<meta[^>]*property=[\"']og:description[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>/i)?.[1] || "").trim();
  const robots = (html.match(/<meta[^>]*name=[\"']robots[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>/i)?.[1] || "").trim();
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").trim();
  return {
    title: stripTags(title),
    description: stripTags(desc),
    canonical,
    ogTitle: stripTags(ogTitle),
    ogDescription: stripTags(ogDesc),
    robots,
    h1: stripTags(h1),
  };
}

function extractCtas(html, baseUrl) {
  const out = [];
  const re = /<(a|button)\b[^>]*(href=[\"']([^\"']+)[\"'])?[^>]*>([\s\S]*?)<\/(a|button)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const href = m[3] || "";
    const text = stripTags(m[4]).slice(0, 80);
    if (!text) continue;
    const looksCta = /(comprar|assinar|agendar|falar|contato|demo|começar|comece|inscrever|cadastre|teste|baixar|orçamento|whatsapp|entrar)/i.test(text);
    if (!looksCta) continue;
    let url = "";
    if (tag === "a" && href) {
      try {
        url = new URL(href, baseUrl).toString();
      } catch {
        url = "";
      }
    }
    out.push({ text, url });
    if (out.length >= 20) break;
  }
  return out;
}

async function fetchText(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const text = await res.text();
  return { status: res.status, text };
}

function parseSitemapUrls(xmlText, { limit = 60 } = {}) {
  const urls = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xmlText))) {
    urls.push(m[1].trim());
    if (urls.length >= limit) break;
  }
  return urls;
}

export async function auditSite({
  baseUrl,
  maxPages = 6,
  maxSitemapUrls = 40,
  includeCompetitors = true,
  webSearchFn, // optional: (q)=>results
}) {
  const url = String(baseUrl || "").trim();
  if (!isHttpUrl(url)) throw new Error("URL inválida");

  const homeUrl = normalizeUrl(url);
  const domain = new URL(homeUrl).hostname;

  const pages = [];
  const visited = new Set();

  async function addPage(pageUrl, label) {
    const u = normalizeUrl(pageUrl);
    if (!isHttpUrl(u)) return;
    if (!sameHost(homeUrl, u)) return;
    if (visited.has(u)) return;
    visited.add(u);
    const { status, text } = await fetchText(u);
    pages.push({ url: u, label, status, html: text });
  }

  // Home first
  await addPage(homeUrl, "home");

  // Discover via sitemap.xml (best effort)
  const sitemapCandidates = [
    new URL("/sitemap.xml", homeUrl).toString(),
    new URL("/sitemap_index.xml", homeUrl).toString(),
    new URL("/sitemap", homeUrl).toString(),
  ];

  let sitemapUrls = [];
  for (const s of sitemapCandidates) {
    try {
      const { status, text } = await fetchText(s);
      if (status >= 200 && status < 300 && /<sitemap|<urlset/i.test(text)) {
        const locs = parseSitemapUrls(text, { limit: maxSitemapUrls });
        sitemapUrls = sitemapUrls.concat(locs);
        // handle sitemap index (one level)
        if (/<sitemapindex/i.test(text)) {
          const subset = locs.slice(0, 4);
          for (const child of subset) {
            try {
              const childRes = await fetchText(child);
              if (childRes.status >= 200 && childRes.status < 300) {
                sitemapUrls = sitemapUrls.concat(parseSitemapUrls(childRes.text, { limit: maxSitemapUrls }));
              }
            } catch {
              // ignore
            }
          }
        }
        break;
      }
    } catch {
      // ignore
    }
  }

  sitemapUrls = Array.from(new Set(sitemapUrls.map(normalizeUrl))).filter((u) => sameHost(homeUrl, u));

  // Add a few pages from sitemap
  const pick = sitemapUrls.filter((u) => u !== homeUrl).slice(0, Math.max(0, maxPages - 1));
  for (const p of pick) {
    if (pages.length >= maxPages) break;
    await addPage(p, "sitemap");
  }

  const home = pages[0];
  const homeMeta = extractMeta(home?.html || "");
  const homeText = stripTags(pickBetween(home?.html || "", /<body\b[^>]*>/i, /<\/body>/i)).slice(0, 2000);
  const homeCtas = extractCtas(home?.html || "", homeUrl);

  const seoFindings = [];
  if (!homeMeta.title) seoFindings.push("Sem <title> na home.");
  if (homeMeta.title && homeMeta.title.length > 65) seoFindings.push("Title muito longo (>65).");
  if (!homeMeta.description) seoFindings.push("Sem meta description na home.");
  if (!homeMeta.h1) seoFindings.push("Sem H1 na home.");
  if (homeMeta.robots && /noindex/i.test(homeMeta.robots)) seoFindings.push("Robots com noindex na home.");
  if (!homeMeta.ogTitle) seoFindings.push("Sem OG title.");
  if (!homeMeta.ogDescription) seoFindings.push("Sem OG description.");

  // Competitors (best-effort)
  let competitorNotes = "";
  if (includeCompetitors && typeof webSearchFn === "function") {
    const q = `concorrentes de ${domain}`;
    try {
      const results = await webSearchFn(q);
      competitorNotes = (results || [])
        .slice(0, 5)
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet || ""}`.trim())
        .join("\n\n");
    } catch {
      competitorNotes = "";
    }
  }

  const backlog = [];
  // Copy / CTA basics
  if (!homeCtas.length) backlog.push({ p: 1, item: "Adicionar CTAs claros acima da dobra (ex.: “Agendar demo”, “Começar agora”)." });
  if (homeMeta.title && !/(\b|^)(marca|brand)/i.test(homeMeta.title)) backlog.push({ p: 3, item: "Revisar title da home para incluir proposta + marca (≤60 chars)." });
  if (!homeMeta.description) backlog.push({ p: 3, item: "Criar meta description (140–160 chars) com benefício + prova." });
  if (!homeMeta.ogTitle || !homeMeta.ogDescription) backlog.push({ p: 4, item: "Configurar OG tags para compartilhamento (WhatsApp/LinkedIn)." });
  if (!homeMeta.canonical) backlog.push({ p: 4, item: "Adicionar canonical na home." });

  const uniquePages = pages.map((p) => `${p.status} ${p.url}`).join("\n");
  const ctasPreview = homeCtas.slice(0, 8).map((c) => `- ${c.text}${c.url ? ` -> ${c.url}` : ""}`).join("\n");

  backlog.sort((a, b) => a.p - b.p);

  return {
    domain,
    scannedPages: pages.length,
    pages,
    summary: {
      title: homeMeta.title,
      h1: homeMeta.h1,
      description: homeMeta.description,
      ctas: homeCtas,
      seoFindings,
      homeSnippet: homeText,
    },
    competitorNotes,
    backlog,
    reportText: [
      `SITE: ${homeUrl}`,
      `DOMÍNIO: ${domain}`,
      `PÁGINAS ANALISADAS: ${pages.length}`,
      "",
      "HOME (SEO):",
      `- Title: ${homeMeta.title || "(vazio)"}`,
      `- H1: ${homeMeta.h1 || "(vazio)"}`,
      `- Meta description: ${homeMeta.description || "(vazio)"}`,
      `- Canonical: ${homeMeta.canonical || "(vazio)"}`,
      `- Robots: ${homeMeta.robots || "(vazio)"}`,
      "",
      "CTAs (home):",
      ctasPreview || "(nenhum CTA detectado)",
      "",
      "ACHADOS SEO:",
      seoFindings.length ? seoFindings.map((x) => `- ${x}`).join("\n") : "- OK",
      "",
      "PÁGINAS VISITADAS:",
      uniquePages || "(nenhuma)",
      competitorNotes ? "\nCONCORRENTES (busca):\n" + competitorNotes : "",
      "",
      "BACKLOG PRIORIZADO:",
      backlog.length
        ? backlog.slice(0, 12).map((b) => `P${b.p} - ${b.item}`).join("\n")
        : "(sem itens)",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

