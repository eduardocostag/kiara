import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import { duckDuckGoSearch } from "./webSearch.js";
<<<<<<< HEAD
import { deepWebResearch } from "./webResearch.js";
=======
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
import { runBrowserTask } from "./browserTool.js";
import { getScreenFrame } from "./screenStore.js";
import { analyzeImage } from "./vision.js";
import { auditSite } from "./siteAudit.js";
import { leadSearch } from "./leadSearch.js";
import { buildLandingPageHtml } from "./landingPage.js";

const execFileAsync = promisify(execFile);

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function truncate(text, max = 8000) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n...[TRUNCADO]`;
}

function extractTextFromHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
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

export const CLIENT_ACTIONS = new Set(["abrir_site", "youtube_busca", "pesquisa"]);
export const SERVER_ACTIONS = new Set([
  "navegar",
  "pesquisar_web",
  "browser_run",
  "ver_tela",
  "site_audit",
  "buscar_leads",
  "gerar_landing",
  "criar_automacao",
  "buscar_url",
  "ler_arquivo",
  "escrever_arquivo",
  "salvar_nota",
  "executar_shell",
]);

export function actionRequiresApproval(tipo) {
  return tipo === "browser_run" || tipo === "executar_shell" || tipo === "escrever_arquivo";
}

function resolveSafePath(baseDir, relativePath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, relativePath);
  if (!target.startsWith(base + path.sep)) {
<<<<<<< HEAD
    throw new Error("Caminho fora do diretorio permitido");
=======
    throw new Error("Caminho fora do diretório permitido");
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
  }
  return target;
}

export function buildToolsPrompt() {
  return `
FERRAMENTAS (use via "acoes"):

1) abrir_site
  dados: { "url": "https://..." }
<<<<<<< HEAD
  efeito: o navegador do usuario abre a pagina.

2) pesquisa
  dados: { "query": "texto" }
  efeito: o navegador do usuario abre diretamente os resultados no Google.

3) youtube_busca
  dados: { "query": "texto" }
  efeito: o navegador do usuario abre resultados no YouTube.

4) navegar
  dados: { "url": "https://...", "objetivo": "o que procurar" }
  efeito: KIARA baixa o HTML e extrai texto da pagina.

4b) pesquisar_web
  dados: { "query": "texto", "profundo": true, "pageLimit": 4 }
  efeito: KIARA pesquisa na web em tempo real. Se "profundo" for true, ela tambem le as paginas principais e traz contexto mais rico com fontes.

4c) browser_run
  dados: { "url": "https://...", "objetivo": "o que fazer", "steps": [ { "action": "click|fill|press|wait|extract", ... } ] }
  efeito: KIARA automatiza o navegador com Playwright. Requer KIARA_ENABLE_PLAYWRIGHT=1 e allowlist de dominios.

4d) ver_tela
  dados: { "pergunta": "o que procurar/entender na tela" }
  efeito: KIARA usa o ultimo frame compartilhado pelo usuario e descreve/analisa.

4e) site_audit
  dados: { "url": "https://...", "maxPages": 6 }
  efeito: KIARA varre sitemap/algumas paginas do site e devolve achados e backlog priorizado.

4f) buscar_leads
  dados: { "nicho": "clinicas odontologicas", "regiao": "sao paulo", "quantidade": 10, "abertasRecentemente": true, "abertasDepois": "2026" }
  efeito: KIARA busca na web e tenta montar uma lista com nome, telefone, endereco e fonte.

4g) gerar_landing
  dados: { "brand": "...", "headline": "...", "subheadline": "...", "cta": "...", "whatsapp": "55...", "primaryColor": "#18f0ff", "niche": "...", "path": "public/landing.html" }
  efeito: KIARA gera uma landing page HTML e pode escrever no projeto.

4h) criar_automacao
  dados: { "nome": "captar-leads", "objetivo": "o que a automacao faz", "url": "https://...", "passos": ["...","..."] }
  efeito: KIARA gera e salva um playbook de automacao reutilizavel no workspace.

5) ler_arquivo
  dados: { "path": "caminho_relativo" }
  efeito: KIARA le um arquivo do projeto.

6) escrever_arquivo
  dados: { "path": "caminho_relativo", "conteudo": "texto" }
  efeito: KIARA escreve/substitui um arquivo do projeto.

7) salvar_nota
  dados: { "titulo": "curto", "conteudo": "texto", "tags": ["marketing","financas"] }
  efeito: KIARA salva conhecimento local para reutilizar no futuro.

8) executar_shell
  dados: { "cmd": "..." }
  efeito: KIARA tenta rodar um comando no servidor.

REGRAS:
- Sempre responda APENAS com JSON valido no formato:
  { "texto": "...", "acoes": [ { "tipo": "...", "dados": { ... } } ] }
- Se precisar de ferramenta, coloque em "acoes" com "tipo" e "dados".
- Se nao precisar, deixe "acoes": [].
`.trim();
}

export async function executeServerAction({ action, baseDir, knowledgeStore, context }) {
=======
  efeito: o navegador do usuário abre a página.

2) pesquisa
  dados: { "query": "texto" }
  efeito: o navegador do usuário abre diretamente os resultados no Google (URL com ?q=...).

3) youtube_busca
  dados: { "query": "texto" }
  efeito: o navegador do usuário abre resultados no YouTube.

4) navegar
  dados: { "url": "https://...", "objetivo": "o que procurar" }
  efeito: KIARA baixa o HTML e extrai texto para você.

4b) pesquisar_web
  dados: { "query": "texto" }
  efeito: KIARA faz uma busca em tempo real e retorna resultados (títulos/links/snippets).

4c) browser_run
  dados: { "url": "https://...", "objetivo": "o que fazer", "steps": [ { "action": "click|fill|press|wait|extract", ... } ] }
  efeito: KIARA automatiza o navegador (Playwright). Requer KIARA_ENABLE_PLAYWRIGHT=1 e allowlist de domínios.

4d) ver_tela
  dados: { "pergunta": "o que procurar/entender na tela" }
  efeito: KIARA usa o último frame compartilhado pelo usuário (se habilitado) e descreve/análise.

4e) site_audit
  dados: { "url": "https://...", "maxPages": 6 } (se url não vier, usa o site alocado do workspace)
  efeito: KIARA varre sitemap/algumas páginas do site e devolve achados + backlog priorizado.

4f) buscar_leads
  dados: { "nicho": "ex: clinicas odontologicas", "regiao": "ex: sao paulo", "quantidade": 10, "abertasRecentemente": true, "abertasDepois": "2026" }
  efeito: KIARA busca na web e tenta montar uma lista com nome/telefone/endereço, possíveis sinais de abertura recente e fonte (heurístico; sem API dedicada).

4g) gerar_landing
  dados: { "brand": "...", "headline": "...", "subheadline": "...", "cta": "...", "whatsapp": "55...", "primaryColor": "#18f0ff", "niche": "...", "path": "public/landing.html" }
  efeito: KIARA gera uma landing page HTML e (se habilitado) escreve no projeto.

4h) criar_automacao
  dados: { "nome": "ex: captar-leads", "objetivo": "o que a automação faz", "url": "https://...", "passos": ["...","..."] }
  efeito: KIARA gera e salva (em data/workspaces/<workspaceId>/automations) um playbook de automação reutilizável.

5) ler_arquivo
  dados: { "path": "caminho_relativo" }
  efeito: KIARA lê um arquivo do projeto (restrito ao diretório do app).

6) escrever_arquivo
  dados: { "path": "caminho_relativo", "conteudo": "texto" }
  efeito: KIARA escreve/substitui um arquivo do projeto (restrito ao diretório do app).

7) salvar_nota
  dados: { "titulo": "curto", "conteudo": "texto", "tags": ["marketing","financas"] }
  efeito: KIARA salva conhecimento para reutilizar no futuro.

8) executar_shell
  dados: { "cmd": "..." }
  efeito: KIARA tenta rodar um comando NO SERVIDOR (desligado por padrão).

REGRAS:
- Sempre responda APENAS com JSON válido no formato:
  { "texto": "...", "acoes": [ { "tipo": "...", "dados": { ... } } ] }
- Se precisar da ferramenta, coloque em "acoes" com "tipo" + "dados".
- Se não precisar, deixe "acoes": [].
`.trim();
}

export async function executeServerAction({
  action,
  baseDir,
  knowledgeStore,
  context,
}) {
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
  const tipo = action?.tipo;
  const dados = action?.dados || {};

  if (!SERVER_ACTIONS.has(tipo)) {
<<<<<<< HEAD
    return { ok: false, tipo, result: "Acao nao executavel no servidor." };
=======
    return { ok: false, tipo, result: "Ação não executável no servidor." };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
  }

  if (tipo === "navegar" || tipo === "buscar_url") {
    const url = String(dados.url || "");
<<<<<<< HEAD
    if (!isHttpUrl(url)) return { ok: false, tipo, result: "URL invalida" };
=======
    if (!isHttpUrl(url)) return { ok: false, tipo, result: "URL inválida" };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = await res.text();
    const text = truncate(extractTextFromHtml(html), 9000);
    return {
      ok: true,
      tipo,
<<<<<<< HEAD
      result: `HTTP ${res.status}\nURL: ${url}\n\nTEXTO EXTRAIDO:\n${text}`,
=======
      result: `HTTP ${res.status}\nURL: ${url}\n\nTEXTO EXTRAÍDO:\n${text}`,
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    };
  }

  if (tipo === "pesquisar_web") {
    const query = String(dados.query || "");
<<<<<<< HEAD
    const deep = Boolean(dados.profundo || dados.deep);

    if (deep) {
      const deepResult = await deepWebResearch(query, {
        searchLimit: Math.max(6, Math.min(Number(dados.searchLimit || 8) || 8, 12)),
        pageLimit: Math.max(2, Math.min(Number(dados.pageLimit || 4) || 4, 6)),
      });
      return { ok: deepResult.ok, tipo, result: deepResult.result };
    }

=======
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    const results = await duckDuckGoSearch(query, { limit: 6 });
    const formatted = results
      .map((r, idx) => {
        const snippet = r.snippet ? `\n   ${r.snippet}` : "";
        return `${idx + 1}. ${r.title}\n   ${r.url}${snippet}`;
      })
      .join("\n\n");

    return { ok: true, tipo, result: formatted || "(sem resultados)" };
  }

  if (tipo === "browser_run") {
    const url = String(dados.url || "");
    const objective = String(dados.objetivo || "");
    const steps = Array.isArray(dados.steps) ? dados.steps : [];

    const r = await runBrowserTask({
      baseDir,
      url,
      steps,
      objective,
      headless: process.env.KIARA_HEADLESS !== "0",
    });

    return { ok: r.ok, tipo, result: r.result };
  }

  if (tipo === "ver_tela") {
    if (process.env.KIARA_ENABLE_SCREEN !== "1") {
      return { ok: false, tipo, result: "Tela desativada (set KIARA_ENABLE_SCREEN=1)" };
    }

    const sessionId = context?.sessionId;
    if (!sessionId) return { ok: false, tipo, result: "sessionId ausente" };

    const frame = getScreenFrame(sessionId);
    if (!frame?.imageBase64Jpeg) {
<<<<<<< HEAD
      return { ok: false, tipo, result: "Nenhuma tela recebida ainda" };
=======
      return { ok: false, tipo, result: "Nenhuma tela recebida ainda (inicie Compartilhar tela)" };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    }

    const userAsk = String(dados.pergunta || "").trim();
    const prompt = [
<<<<<<< HEAD
      "Voce esta analisando a tela do usuario (captura recente).",
      "",
      "Tarefas:",
      "1) Descreva o que aparece na tela.",
      "2) Extraia informacoes uteis.",
      "3) Diga o que parece estar dando certo e o que esta confuso/errado.",
      "4) Sugira proximos passos praticos em bullets.",
      "5) Se houver dados sensiveis, nao copie; apenas sinalize 'conteudo sensivel detectado'.",
      "",
      userAsk ? `Pergunta do usuario: ${userAsk}` : "Pergunta do usuario: (nao especificada)",
    ].join("\n");

=======
      "Você está analisando a tela do usuário (captura recente).",
      "",
      "Tarefas:",
      "1) Descreva o que aparece na tela (apps/janelas, o que o usuário está fazendo).",
      "2) Extraia informações úteis (títulos, botões/menus relevantes, alertas/erros, números importantes).",
      "3) Diga o que parece estar dando certo e o que está confuso/errado.",
      "4) Sugira próximos passos práticos (em bullets, com prioridade).",
      "5) Se houver dados sensíveis (senhas, chaves, e-mails, números de documento/cartão), NÃO copie; apenas sinalize: 'conteúdo sensível detectado'.",
      "",
      userAsk ? `Pergunta do usuário: ${userAsk}` : "Pergunta do usuário: (não especificada)",
    ].join("\n");
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    const vision = await analyzeImage({
      imageBase64Jpeg: frame.imageBase64Jpeg,
      prompt,
    });

    const meta = `FRAME: ${new Date(frame.ts).toISOString()} (${frame.w || "?"}x${frame.h || "?"})`;
<<<<<<< HEAD
    return { ok: vision.ok, tipo, result: `${meta}\n\n${vision.result}` };
=======
    return {
      ok: vision.ok,
      tipo,
      result: `${meta}\n\n${vision.result}`,
    };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
  }

  if (tipo === "site_audit") {
    const url = String(dados.url || context?.alocacaoUrl || "");
    const maxPages = Math.max(2, Math.min(Number(dados.maxPages || 6) || 6, 10));
    if (!url) return { ok: false, tipo, result: "URL ausente" };

    const report = await auditSite({
      baseUrl: url,
      maxPages,
      includeCompetitors: true,
      webSearchFn: async (q) => duckDuckGoSearch(q, { limit: 6 }),
    });

    return { ok: true, tipo, result: report.reportText };
  }

  if (tipo === "buscar_leads") {
    const nicho = String(dados.nicho || "");
    const regiao = String(dados.regiao || "");
    const quantidade = Math.max(1, Math.min(Number(dados.quantidade || 10) || 10, 30));
    const abertasRecentemente = Boolean(dados.abertasRecentemente || dados.recentes);
<<<<<<< HEAD
    const abertasDepois = String(dados.abertasDepois || dados.abertasDepoisDe || "").trim();
=======
    const abertasDepois = String(dados.abertasDepois || dados.abertasDepoisDe || "").trim(); // "YYYY-MM-DD" ou "YYYY"
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    if (!nicho) return { ok: false, tipo, result: "Nicho ausente" };

    const baseSearchFn = async (q) => duckDuckGoSearch(q, { limit: 10 });
    const queries = (() => {
      const base = String(dados.query || "").trim();
      if (base) return [base];
<<<<<<< HEAD
      if (!abertasRecentemente) return [`contato telefone endereco ${nicho} ${regiao}`.trim()];
=======
      if (!abertasRecentemente) return [`contato telefone endereço ${nicho} ${regiao}`.trim()];
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a

      const yearHint =
        abertasDepois && /\b20\d{2}\b/.test(abertasDepois)
          ? ` ${abertasDepois.match(/\b20\d{2}\b/)?.[0]}`
          : "";
      return [
<<<<<<< HEAD
        `inaugurou abriu nova ${nicho} ${regiao} contato telefone endereco${yearHint}`.trim(),
        `inauguracao ${nicho} ${regiao} telefone endereco${yearHint}`.trim(),
=======
        `inaugurou abriu nova ${nicho} ${regiao} contato telefone endereço${yearHint}`.trim(),
        `inauguração ${nicho} ${regiao} telefone endereço${yearHint}`.trim(),
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
      ];
    })();

    const all = [];
    for (const q of queries) {
      const chunk = await leadSearch({
        query: q,
        regionHint: "",
        maxLeads: quantidade,
        searchFn: baseSearchFn,
        maxPagesToScrape: 10,
        openedAfter: abertasDepois || undefined,
        requireRecentlyOpened: abertasRecentemente,
      });
      all.push(...(chunk || []));
      if (all.length >= quantidade) break;
    }

<<<<<<< HEAD
=======
    // Dedup por fonte e limita
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    const seen = new Set();
    const leads = [];
    for (const l of all) {
      if (!l?.fonte) continue;
      if (seen.has(l.fonte)) continue;
      seen.add(l.fonte);
      leads.push(l);
      if (leads.length >= quantidade) break;
    }

    const text = leads
<<<<<<< HEAD
      .map((l, i) =>
        [
          `${i + 1}. ${l.nome || "(sem nome)"}`,
          `   Telefone: ${l.telefone || "(nao encontrado)"}`,
          `   Endereco: ${l.endereco || "(nao encontrado)"}`,
          l.abertura?.ano ? `   Sinal de abertura: ${l.abertura.ano}` : l.abertura ? "   Sinal de abertura: (detectado)" : "",
          `   Fonte: ${l.fonte}`,
        ]
          .filter(Boolean)
          .join("\n"),
=======
      .map(
        (l, i) =>
          [
            `${i + 1}. ${l.nome || "(sem nome)"}`,
            `   Telefone: ${l.telefone || "(não encontrado)"}`,
            `   Endereço: ${l.endereco || "(não encontrado)"}`,
            l.abertura?.ano ? `   Sinal de abertura: ${l.abertura.ano}` : l.abertura ? `   Sinal de abertura: (detectado)` : "",
            `   Fonte: ${l.fonte}`,
          ]
            .filter(Boolean)
            .join("\n"),
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
      )
      .join("\n\n");

    const note =
      abertasRecentemente && !leads.length
<<<<<<< HEAD
        ? "\n\nObs: 'abertas recentemente' e heuristico via web. Se quiser, diga cidade/estado e uma data para refinar."
=======
        ? "\n\nObs: 'abertas recentemente' é heurístico via web (inauguração/abertura). Se quiser, diga cidade/estado e uma data (ex: 2026) para refinar."
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
        : "";
    return { ok: true, tipo, result: (text || "(sem leads)") + note };
  }

  if (tipo === "gerar_landing") {
    const html = buildLandingPageHtml({
      brand: dados.brand,
      headline: dados.headline,
      subheadline: dados.subheadline,
      cta: dados.cta,
      whatsapp: dados.whatsapp,
      primaryColor: dados.primaryColor,
      niche: dados.niche,
      bullets: dados.bullets,
      faq: dados.faq,
    });

    const relativePath = String(dados.path || "public/landing.html");
    if (process.env.KIARA_ENABLE_WRITE_ANY === "1") {
      const target = path.resolve(baseDir, relativePath);
      if (!target.startsWith(path.resolve(baseDir) + path.sep)) {
<<<<<<< HEAD
        return { ok: false, tipo, result: "Caminho fora do diretorio permitido" };
=======
        return { ok: false, tipo, result: "Caminho fora do diretório permitido" };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, html, "utf8");
      return { ok: true, tipo, result: `Landing page escrita em: ${relativePath}` };
    }

<<<<<<< HEAD
    return { ok: true, tipo, result: "Landing gerada (habilite KIARA_ENABLE_WRITE_ANY=1 para escrever no projeto)." };
=======
    return {
      ok: true,
      tipo,
      result: "Landing gerada (habilite KIARA_ENABLE_WRITE_ANY=1 para escrever no projeto).",
    };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
  }

  if (tipo === "criar_automacao") {
    const workspaceId = String(context?.workspaceId || "default");
    const nome = String(dados.nome || "automacao").trim();
    const objetivo = String(dados.objetivo || "").trim();
    const url = String(dados.url || context?.alocacaoUrl || "").trim();
    const passos = Array.isArray(dados.passos) ? dados.passos.filter(Boolean).map(String) : [];

    const safeName = (nome || "automacao")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

<<<<<<< HEAD
    const spec = { nome: nome || safeName, objetivo, url, passos, createdAt: new Date().toISOString() };
=======
    const spec = {
      nome: nome || safeName,
      objetivo,
      url,
      passos,
      createdAt: new Date().toISOString(),
    };

>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    const relativePath = path.join("data", "workspaces", workspaceId, "automations", `${safeName || "automacao"}.json`);

    if (process.env.KIARA_ENABLE_WRITE === "1") {
      const target = resolveSafePath(baseDir, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, JSON.stringify(spec, null, 2), "utf8");
<<<<<<< HEAD
      return { ok: true, tipo, result: `Automacao salva em: ${relativePath}` };
=======
      return { ok: true, tipo, result: `Automação salva em: ${relativePath}` };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    }

    return {
      ok: true,
      tipo,
<<<<<<< HEAD
      result: "Automacao gerada (habilite KIARA_ENABLE_WRITE=1 para salvar no projeto).\n\n" + truncate(JSON.stringify(spec, null, 2), 9000),
=======
      result:
        "Automação gerada (habilite KIARA_ENABLE_WRITE=1 para salvar no projeto).\n\n" +
        truncate(JSON.stringify(spec, null, 2), 9000),
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    };
  }

  if (tipo === "ler_arquivo") {
    const relativePath = String(dados.path || "");
    if (relativePath.toLowerCase().endsWith(".env") || relativePath.toLowerCase().includes(".env")) {
      return { ok: false, tipo, result: "Leitura de .env bloqueada" };
    }

    const allowedRoots = ["public" + path.sep, "data" + path.sep];
    const normalized = relativePath.replace(/\//g, path.sep);
    const inAllowedRoot = allowedRoots.some((r) => normalized.startsWith(r));
    if (!inAllowedRoot && process.env.KIARA_ENABLE_READ_ANY !== "1") {
<<<<<<< HEAD
      return { ok: false, tipo, result: "Leitura restrita a public/ e data/ (set KIARA_ENABLE_READ_ANY=1 para liberar)" };
=======
      return {
        ok: false,
        tipo,
        result: "Leitura restrita a public/ e data/ (set KIARA_ENABLE_READ_ANY=1 para liberar)",
      };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    }

    const target = resolveSafePath(baseDir, relativePath);
    const content = await fs.readFile(target, "utf8");
    return { ok: true, tipo, result: truncate(content, 9000) };
  }

  if (tipo === "escrever_arquivo") {
    const relativePath = String(dados.path || "");
    if (process.env.KIARA_ENABLE_WRITE !== "1") {
      return { ok: false, tipo, result: "Escrita desativada (set KIARA_ENABLE_WRITE=1)" };
    }

    const normalized = relativePath.replace(/\//g, path.sep);
    const inDataRoot = normalized.startsWith("data" + path.sep);
    if (!inDataRoot && process.env.KIARA_ENABLE_WRITE_ANY !== "1") {
<<<<<<< HEAD
      return { ok: false, tipo, result: "Escrita restrita a data/ (set KIARA_ENABLE_WRITE_ANY=1 para liberar)" };
=======
      return {
        ok: false,
        tipo,
        result: "Escrita restrita a data/ (set KIARA_ENABLE_WRITE_ANY=1 para liberar)",
      };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    }

    const target = resolveSafePath(baseDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const conteudo = String(dados.conteudo ?? "");
    await fs.writeFile(target, conteudo, "utf8");
    return { ok: true, tipo, result: `Arquivo escrito: ${relativePath}` };
  }

  if (tipo === "salvar_nota") {
<<<<<<< HEAD
    if (!knowledgeStore) return { ok: false, tipo, result: "Knowledge store indisponivel" };
=======
    if (!knowledgeStore) return { ok: false, tipo, result: "Knowledge store indisponível" };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    await knowledgeStore.addNote(context?.workspaceId || "default", {
      titulo: dados.titulo,
      conteudo: dados.conteudo,
      tags: dados.tags,
    });
    return { ok: true, tipo, result: "Nota salva" };
  }

  if (tipo === "executar_shell") {
    if (process.env.KIARA_ENABLE_SHELL !== "1") {
      return { ok: false, tipo, result: "Shell desativado (set KIARA_ENABLE_SHELL=1)" };
    }

    const cmd = String(dados.cmd || "").trim();
    if (!cmd) return { ok: false, tipo, result: "Comando vazio" };

<<<<<<< HEAD
    const [bin, ...args] = cmd.split(/\s+/);
    const allowed = new Set(["node", "npm", "pnpm", "yarn", "git", "python", "python3"]);
    if (!allowed.has(bin)) {
      return { ok: false, tipo, result: `Binario nao permitido: ${bin}` };
=======
    // allowlist mínima (evita virar RCE genérico)
    const [bin, ...args] = cmd.split(/\s+/);
    const allowed = new Set(["node", "npm", "pnpm", "yarn", "git", "python", "python3"]);
    if (!allowed.has(bin)) {
      return { ok: false, tipo, result: `Binário não permitido: ${bin}` };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    }

    const { stdout, stderr } = await execFileAsync(bin, args, { cwd: baseDir, timeout: 60_000 });
    const out = [stdout, stderr].filter(Boolean).join("\n").trim();
<<<<<<< HEAD
    return { ok: true, tipo, result: truncate(out, 9000) || "(sem saida)" };
  }

  return { ok: false, tipo, result: "Acao desconhecida" };
=======
    return { ok: true, tipo, result: truncate(out, 9000) || "(sem saída)" };
  }

  return { ok: false, tipo, result: "Ação desconhecida" };
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
}
