import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import { duckDuckGoSearch } from "./webSearch.js";
import { deepWebResearch } from "./webResearch.js";
import { runBrowserTask } from "./browserTool.js";
import { getScreenFrame, getScreenFrameSummary, getScreenAnalysisContext, rememberScreenObservation, rememberScreenAnalysis, findScreenAnalysis, updateScreenLiveSummary, getScreenLiveSummary } from "./screenStore.js";
import { analyzeImage, analyzeImageStructured } from "./vision.js";
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

function inferAutomationTags(text) {
  const lower = String(text || "").toLowerCase();
  const tags = [];
  if (/\b(marketing|copy|seo|trafego|instagram|anuncio)\b/.test(lower)) tags.push("marketing");
  if (/\b(vendas|lead|proposta|fechamento|oferta)\b/.test(lower)) tags.push("vendas");
  if (/\b(financ|caixa|margem|receita|lucro)\b/.test(lower)) tags.push("financas");
  if (/\b(gestao|processo|operacao|backlog|prioridade)\b/.test(lower)) tags.push("gestao");
  if (/\b(api|automacao|agente|integra|backend|frontend|site|codigo)\b/.test(lower)) tags.push("tecnologia");
  if (/\b(linux|docker|container|compose|nginx|systemd|servidor|infra)\b/.test(lower)) tags.push("infraestrutura");
  return [...new Set(tags)];
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m${rest}s` : `${minutes}m`;
}

function summarizeVisualPattern(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join("\n")
    .slice(0, 900);
}

function normalizeShortList(items, max = 8) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, max);
}

function extractVisualSignals(text) {
  const source = String(text || "");
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const currentFocus = lines[0] || "";
  const currentApp =
    lines.find((line) => /\b(chrome|edge|firefox|github|youtube|google|obsidian|vscode|visual studio code|terminal|explorer|windows)\b/i.test(line)) || "";

  const recentInsights = lines.slice(0, 4).map((line) => line.replace(/^[-*]\s*/, ""));
  const recentChanges = lines
    .filter((line) => /\b(erro|falha|carregando|loading|aberto|aberta|selecionado|selecionada|botao|clique|campo|modal|janela)\b/i.test(line))
    .slice(0, 3)
    .map((line) => line.replace(/^[-*]\s*/, ""));

  return { currentFocus, currentApp, recentChanges, recentInsights };
}

function extractVisualSignalsFromStructured(structured) {
  if (!structured || typeof structured !== "object") {
    return { currentFocus: "", currentApp: "", recentChanges: [], recentInsights: [] };
  }

  const currentFocus =
    structured.summary ||
    structured.primaryAction ||
    structured.screenType ||
    structured.appOrSite ||
    "";
  const currentApp = structured.appOrSite || "";
  const recentChanges = normalizeShortList([
    ...(structured.errors || []),
    structured.nextStep,
    structured.primaryAction,
  ], 6);
  const recentInsights = normalizeShortList([
    structured.summary,
    structured.screenType,
    structured.primaryAction,
    ...(structured.importantElements || []),
    ...(structured.visibleText || []),
    structured.nextStep,
  ], 8);

  return { currentFocus, currentApp, recentChanges, recentInsights };
}

export const CLIENT_ACTIONS = new Set(["abrir_site", "youtube_busca", "pesquisa"]);
export const SERVER_ACTIONS = new Set([
  "navegar",
  "pesquisar_web",
  "browser_run",
  "ver_tela",
  "desktop_abrir_links",
  "desktop_abrir_app",
  "desktop_abrir_multiplos",
  "desktop_abrir_janelas_browser",
  "desktop_abrir_caminho",
  "desktop_copiar_texto",
  "desktop_enviar_teclas",
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
  return [
    "browser_run",
    "executar_shell",
    "escrever_arquivo",
    "desktop_abrir_links",
    "desktop_abrir_app",
    "desktop_abrir_multiplos",
    "desktop_abrir_janelas_browser",
    "desktop_abrir_caminho",
    "desktop_copiar_texto",
    "desktop_enviar_teclas",
  ].includes(tipo);
}

function resolveSafePath(baseDir, relativePath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, relativePath);
  if (!target.startsWith(base + path.sep)) {
    throw new Error("Caminho fora do diretorio permitido");
  }
  return target;
}

function psSingleQuote(value) {
  return String(value || "").replace(/'/g, "''");
}

function buildDesktopOpenAppCommand(app, args = []) {
  const safeApp = String(app || "").trim().toLowerCase();
  const allowlist = new Map([
    ["vscode", { file: "code" }],
    ["code", { file: "code" }],
    ["notepad", { file: "notepad.exe" }],
    ["bloco de notas", { file: "notepad.exe" }],
    ["explorer", { file: "explorer.exe" }],
    ["explorador", { file: "explorer.exe" }],
    ["powershell", { file: "powershell.exe" }],
    ["terminal", { file: "wt.exe" }],
    ["cmd", { file: "cmd.exe" }],
    ["chrome", { file: "chrome.exe" }],
    ["edge", { file: "msedge.exe" }],
    ["firefox", { file: "firefox.exe" }],
    ["obsidian", { file: "obsidian.exe" }],
    ["discord", { file: "discord.exe" }],
    ["spotify", { file: "spotify.exe" }],
    ["taskmgr", { file: "taskmgr.exe" }],
    ["gerenciador de tarefas", { file: "taskmgr.exe" }],
  ]);
  const entry = allowlist.get(safeApp);
  if (!entry) {
    throw new Error(`Aplicativo nao permitido: ${app}`);
  }
  const argList = Array.isArray(args) ? args.filter(Boolean).map((item) => `'${psSingleQuote(item)}'`).join(", ") : "";
  return argList
    ? `Start-Process -FilePath '${psSingleQuote(entry.file)}' -ArgumentList ${argList}`
    : `Start-Process -FilePath '${psSingleQuote(entry.file)}'`;
}

function buildDesktopOpenMultipleCommand(launches = []) {
  const items = Array.isArray(launches) ? launches : [];
  const commands = items
    .map((item) => buildDesktopOpenAppCommand(item?.app, Array.isArray(item?.args) ? item.args : []))
    .filter(Boolean);
  if (!commands.length) throw new Error("Nenhum aplicativo/site para abrir");
  return commands.join("; ");
}

function buildDesktopOpenLinksCommand(urls = []) {
  const items = [...new Set((Array.isArray(urls) ? urls : []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!items.length) throw new Error("Nenhum link para abrir");
  return items
    .map((url) => {
      if (!isHttpUrl(url)) throw new Error(`URL invalida: ${url}`);
      return `Start-Process '${psSingleQuote(url)}'`;
    })
    .join("; ");
}

function buildDesktopOpenBrowserWindowsCommand(app, count, urls = []) {
  const browser = String(app || "").trim().toLowerCase();
  const total = Math.max(1, Math.min(Number(count || 1) || 1, 12));
  const normalizedUrls = [...new Set((Array.isArray(urls) ? urls : []).map((item) => String(item || "").trim()).filter(Boolean))];
  const commands = [];

  for (let index = 0; index < total; index++) {
    const args = ["--new-window"];
    const url = normalizedUrls[index] || normalizedUrls[0] || "about:blank";
    if (url && url !== "about:blank" && !isHttpUrl(url)) {
      throw new Error(`URL invalida para nova janela: ${url}`);
    }
    if (url) args.push(url);
    commands.push(buildDesktopOpenAppCommand(browser, args));
  }

  return commands.join("; ");
}

function buildDesktopOpenPathCommand(rawPath) {
  const target = String(rawPath || "").trim();
  if (!target) throw new Error("Caminho ausente");
  return `Start-Process -FilePath 'explorer.exe' -ArgumentList '${psSingleQuote(target)}'`;
}

function buildDesktopClipboardCommand(text) {
  const safeText = psSingleQuote(String(text || ""));
  return `Set-Clipboard -Value '${safeText}'`;
}

function buildDesktopKeysCommand(keys) {
  const safeKeys = String(keys || "").trim();
  if (!safeKeys) throw new Error("Teclas ausentes");
  return `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${psSingleQuote(safeKeys)}')`;
}

export function buildToolsPrompt() {
  return `
FERRAMENTAS (use via "acoes"):

1) abrir_site
  dados: { "url": "https://..." }
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
  dados: {
    "url": "https://...",
    "objetivo": "o que fazer",
    "query": "termo opcional para pesquisa no site",
    "steps": [ { "action": "click|fill|type|press|wait|wait_for|extract|hover|select|scroll|goto", ... } ]
  }
  efeito: KIARA automatiza o navegador com Playwright. Se "steps" vier vazio, ela tenta montar um plano automatico basico a partir do objetivo/query. Requer KIARA_ENABLE_PLAYWRIGHT=1.

4d) ver_tela
  dados: { "pergunta": "o que procurar/entender na tela" }
  efeito: KIARA usa o ultimo frame compartilhado pelo usuario e descreve/analisa.
  use quando a pergunta depender do que aparece na tela, do erro visivel, do lugar para clicar ou do contexto visual atual.

4e) desktop_abrir_app
  dados: { "app": "vscode|obsidian|explorer|notepad|powershell|terminal|chrome|edge|firefox|spotify|discord", "args": ["opcional"] }
  efeito: KIARA abre um aplicativo local do Windows.

4f) desktop_abrir_links
  dados: { "urls": ["https://google.com", "https://github.com", "https://youtube.com"] }
  efeito: KIARA abre varios sites em paralelo no navegador padrao do Windows, um processo por link.

4g) desktop_abrir_multiplos
  dados: { "launches": [ { "app": "chrome", "args": ["https://google.com"] }, { "app": "edge", "args": ["https://github.com"] } ] }
  efeito: KIARA abre varios navegadores/aplicativos locais em paralelo, cada um com seus argumentos e URLs.

4h) desktop_abrir_janelas_browser
  dados: { "app": "chrome|edge|firefox", "count": 5, "urls": ["https://google.com", "https://github.com"] }
  efeito: KIARA abre varias janelas separadas do navegador indicado. Se houver menos URLs do que janelas, repete a primeira URL ou abre em branco.

4i) desktop_abrir_caminho
  dados: { "path": "C:\\\\..." }
  efeito: KIARA abre uma pasta/arquivo local no Explorer.

4j) desktop_copiar_texto
  dados: { "text": "texto para area de transferencia" }
  efeito: KIARA copia texto para a area de transferencia local.

4k) desktop_enviar_teclas
  dados: { "keys": "^l" }
  efeito: KIARA envia teclas para a janela ativa do Windows. Exemplo: "^l", "%{TAB}", "{ENTER}".

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
  dados: { "titulo": "curto", "conteudo": "texto", "tags": ["marketing","financas"], "tipoConhecimento": "nota|preferencia|padrao|fato" }
  efeito: KIARA salva conhecimento local para reutilizar no futuro.

8) executar_shell
  dados: { "cmd": "..." }
  efeito: KIARA tenta rodar um comando no servidor.

REGRAS:
- Sempre responda APENAS com JSON valido no formato:
  { "texto": "...", "fala": "...", "acoes": [ { "tipo": "...", "dados": { ... } } ] }
- "texto" pode ser mais completo para raciocinio e continuidade.
- "fala" deve soar natural, curta, oral e sem explicar protocolo interno desnecessariamente.
- Se precisar de ferramenta, coloque em "acoes" com "tipo" e "dados".
- Se nao precisar, deixe "acoes": [].
- Para desktop local, prefira ferramentas explicitas de desktop em vez de "executar_shell".
`.trim();
}

export async function executeServerAction({ action, baseDir, knowledgeStore, context }) {
  const tipo = action?.tipo;
  const dados = action?.dados || {};

  if (!SERVER_ACTIONS.has(tipo)) {
    return { ok: false, tipo, result: "Acao nao executavel no servidor." };
  }

  if (tipo === "navegar" || tipo === "buscar_url") {
    const url = String(dados.url || "");
    if (!isHttpUrl(url)) return { ok: false, tipo, result: "URL invalida" };

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
      result: `HTTP ${res.status}\nURL: ${url}\n\nTEXTO EXTRAIDO:\n${text}`,
    };
  }

  if (tipo === "pesquisar_web") {
    const query = String(dados.query || "");
    const deep = Boolean(dados.profundo || dados.deep);

    if (deep) {
      const deepResult = await deepWebResearch(query, {
        searchLimit: Math.max(6, Math.min(Number(dados.searchLimit || 8) || 8, 12)),
        pageLimit: Math.max(2, Math.min(Number(dados.pageLimit || 4) || 4, 6)),
      });
      return { ok: deepResult.ok, tipo, result: deepResult.result };
    }

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
    const query = String(dados.query || "");
    const steps = Array.isArray(dados.steps) ? dados.steps : [];

    const r = await runBrowserTask({
      baseDir,
      url,
      steps,
      objective,
      query,
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
    const frameSummary = getScreenFrameSummary(sessionId);
    const priorContext = getScreenAnalysisContext(sessionId, { limit: 2 });
    const liveSummary = getScreenLiveSummary(sessionId);
    if (!frame?.imageBase64Jpeg) {
      return { ok: false, tipo, result: "Nenhuma tela recebida ainda" };
    }

    const userAsk = String(dados.pergunta || "").trim();
    const cached = findScreenAnalysis(sessionId, {
      prompt: userAsk,
      signature: frame.signature,
    });
    if (cached?.result) {
      const meta = [
        `FRAME: ${new Date(frame.ts).toISOString()} (${frame.w || "?"}x${frame.h || "?"})`,
        "CACHE: analise reutilizada do mesmo frame",
      ].join("\n");
      return { ok: true, tipo, result: `${meta}\n\n${cached.result}` };
    }

    const prompt = [
      "Voce esta analisando a tela do usuario (captura recente).",
      "",
      "Tarefas:",
      "1) Descreva o que aparece na tela.",
      "2) Extraia informacoes uteis.",
      "3) Diga o que parece estar dando certo e o que esta confuso/errado.",
      "4) Sugira proximos passos praticos em bullets.",
      "5) Se houver dados sensiveis, nao copie; apenas sinalize 'conteudo sensivel detectado'.",
      "",
      frameSummary
        ? `Contexto temporal: tela compartilhada ha ${formatDuration(frameSummary.activeForMs)}; ultimo frame ha ${formatDuration(frameSummary.ageMs)}; total de frames recebidos: ${frameSummary.totalFrames}; houve mudanca visual recente: ${frameSummary.changedInRecentFrames ? "sim" : "nao"}.`
        : "",
      priorContext ? `Observacoes anteriores da mesma sessao:\n${priorContext}` : "",
      liveSummary?.currentFocus ? `Resumo visual continuo atual:\nFoco: ${liveSummary.currentFocus}` : "",
      "",
      userAsk ? `Pergunta do usuario: ${userAsk}` : "Pergunta do usuario: (nao especificada)",
    ].join("\n");

    const structuredVision = await analyzeImageStructured({
      imageBase64Jpeg: frame.imageBase64Jpeg,
      prompt,
    });
    const vision =
      structuredVision.ok
        ? structuredVision
        : await analyzeImage({
            imageBase64Jpeg: frame.imageBase64Jpeg,
            prompt,
          });

    if (vision.ok) {
      const structured = vision.structured || null;
      rememberScreenObservation(sessionId, {
        prompt: userAsk,
        summary: String(vision.result || "").slice(0, 1500),
        signature: frame.signature,
      });
      rememberScreenAnalysis(sessionId, {
        prompt: userAsk,
        result: String(vision.result || "").slice(0, 2000),
        signature: frame.signature,
      });
      const signals = structured ? extractVisualSignalsFromStructured(structured) : extractVisualSignals(vision.result);
      const mergedInsights = [...new Set([...(liveSummary?.recentInsights || []), ...(signals.recentInsights || [])])].slice(-8);
      const mergedChanges = [...new Set([...(liveSummary?.recentChanges || []), ...(signals.recentChanges || [])])].slice(-6);
      updateScreenLiveSummary(sessionId, {
        currentFocus: signals.currentFocus || liveSummary?.currentFocus || "",
        currentApp: signals.currentApp || liveSummary?.currentApp || "",
        recentInsights: mergedInsights,
        recentChanges: mergedChanges,
      });
      if (knowledgeStore && context?.workspaceId) {
        await knowledgeStore.addNote(context.workspaceId, {
          titulo: "Padrao visual observado",
          conteudo: [
            userAsk ? `Pergunta: ${userAsk}` : "Pergunta: (nao especificada)",
            "",
            `Resumo visual:`,
            summarizeVisualPattern(vision.result),
            structured?.appOrSite ? `\nApp/Site detectado: ${structured.appOrSite}` : "",
            structured?.screenType ? `Tela detectada: ${structured.screenType}` : "",
            structured?.nextStep ? `Proximo passo sugerido: ${structured.nextStep}` : "",
          ].join("\n"),
          tags: ["screen", "visual", "padrao-ui"],
          tipoConhecimento: "padrao",
        });
      }
    }

    const meta = [
      `FRAME: ${new Date(frame.ts).toISOString()} (${frame.w || "?"}x${frame.h || "?"})`,
      frameSummary ? `SESSAO_VISUAL: ativa ha ${formatDuration(frameSummary.activeForMs)}; frames=${frameSummary.totalFrames}; mudanca_recente=${frameSummary.changedInRecentFrames ? "sim" : "nao"}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { ok: vision.ok, tipo, result: `${meta}\n\n${vision.result}` };
  }

  if (tipo === "desktop_abrir_app") {
    const app = String(dados.app || "").trim();
    const args = Array.isArray(dados.args) ? dados.args.map((item) => String(item)) : [];
    const command = buildDesktopOpenAppCommand(app, args);
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { cwd: baseDir, timeout: 20_000 });
    return { ok: true, tipo, result: `Aplicativo aberto: ${app}` };
  }

  if (tipo === "desktop_abrir_links") {
    const urls = Array.isArray(dados.urls) ? dados.urls.map((item) => String(item)) : [];
    const command = buildDesktopOpenLinksCommand(urls);
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { cwd: baseDir, timeout: 25_000 });
    return {
      ok: true,
      tipo,
      result: `Links abertos: ${urls.join(" | ")}`,
    };
  }

  if (tipo === "desktop_abrir_multiplos") {
    const launches = Array.isArray(dados.launches)
      ? dados.launches.map((item) => ({
          app: String(item?.app || "").trim(),
          args: Array.isArray(item?.args) ? item.args.map((arg) => String(arg)) : [],
        }))
      : [];
    const command = buildDesktopOpenMultipleCommand(launches);
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { cwd: baseDir, timeout: 25_000 });
    return {
      ok: true,
      tipo,
      result: `Aberturas disparadas: ${launches.map((item) => `${item.app}${item.args?.length ? `(${item.args.join(", ")})` : ""}`).join(" | ")}`,
    };
  }

  if (tipo === "desktop_abrir_janelas_browser") {
    const app = String(dados.app || "").trim();
    const count = Number(dados.count || 1) || 1;
    const urls = Array.isArray(dados.urls) ? dados.urls.map((item) => String(item)) : [];
    const command = buildDesktopOpenBrowserWindowsCommand(app, count, urls);
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { cwd: baseDir, timeout: 25_000 });
    return {
      ok: true,
      tipo,
      result: `Janelas abertas: navegador=${app}; quantidade=${count}; urls=${urls.join(" | ") || "about:blank"}`,
    };
  }

  if (tipo === "desktop_abrir_caminho") {
    const rawPath = String(dados.path || "").trim();
    const command = buildDesktopOpenPathCommand(rawPath);
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { cwd: baseDir, timeout: 20_000 });
    return { ok: true, tipo, result: `Caminho aberto: ${rawPath}` };
  }

  if (tipo === "desktop_copiar_texto") {
    const text = String(dados.text || "");
    const command = buildDesktopClipboardCommand(text);
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { cwd: baseDir, timeout: 15_000 });
    return { ok: true, tipo, result: `Texto copiado para a area de transferencia (${text.length} caracteres)` };
  }

  if (tipo === "desktop_enviar_teclas") {
    const keys = String(dados.keys || "").trim();
    const command = buildDesktopKeysCommand(keys);
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { cwd: baseDir, timeout: 15_000 });
    return { ok: true, tipo, result: `Teclas enviadas para a janela ativa: ${keys}` };
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
    const abertasDepois = String(dados.abertasDepois || dados.abertasDepoisDe || "").trim();
    if (!nicho) return { ok: false, tipo, result: "Nicho ausente" };

    const baseSearchFn = async (q) => duckDuckGoSearch(q, { limit: 10 });
    const queries = (() => {
      const base = String(dados.query || "").trim();
      if (base) return [base];
      if (!abertasRecentemente) return [`contato telefone endereco ${nicho} ${regiao}`.trim()];

      const yearHint =
        abertasDepois && /\b20\d{2}\b/.test(abertasDepois)
          ? ` ${abertasDepois.match(/\b20\d{2}\b/)?.[0]}`
          : "";
      return [
        `inaugurou abriu nova ${nicho} ${regiao} contato telefone endereco${yearHint}`.trim(),
        `inauguracao ${nicho} ${regiao} telefone endereco${yearHint}`.trim(),
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
      )
      .join("\n\n");

    const note =
      abertasRecentemente && !leads.length
        ? "\n\nObs: 'abertas recentemente' e heuristico via web. Se quiser, diga cidade/estado e uma data para refinar."
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
        return { ok: false, tipo, result: "Caminho fora do diretorio permitido" };
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, html, "utf8");
      return { ok: true, tipo, result: `Landing page escrita em: ${relativePath}` };
    }

    return { ok: true, tipo, result: "Landing gerada (habilite KIARA_ENABLE_WRITE_ANY=1 para escrever no projeto)." };
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

    const tags = inferAutomationTags(`${nome}\n${objetivo}\n${url}\n${passos.join("\n")}`);
    const spec = {
      nome: nome || safeName,
      objetivo,
      url,
      passos,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const relativePath = path.join("data", "workspaces", workspaceId, "automations", `${safeName || "automacao"}.json`);

    if (process.env.KIARA_ENABLE_WRITE === "1") {
      const target = resolveSafePath(baseDir, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, JSON.stringify(spec, null, 2), "utf8");
      return { ok: true, tipo, result: `Automacao salva em: ${relativePath}` };
    }

    return {
      ok: true,
      tipo,
      result: "Automacao gerada (habilite KIARA_ENABLE_WRITE=1 para salvar no projeto).\n\n" + truncate(JSON.stringify(spec, null, 2), 9000),
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
      return { ok: false, tipo, result: "Leitura restrita a public/ e data/ (set KIARA_ENABLE_READ_ANY=1 para liberar)" };
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
      return { ok: false, tipo, result: "Escrita restrita a data/ (set KIARA_ENABLE_WRITE_ANY=1 para liberar)" };
    }

    const target = resolveSafePath(baseDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const conteudo = String(dados.conteudo ?? "");
    await fs.writeFile(target, conteudo, "utf8");
    return { ok: true, tipo, result: `Arquivo escrito: ${relativePath}` };
  }

  if (tipo === "salvar_nota") {
    if (!knowledgeStore) return { ok: false, tipo, result: "Knowledge store indisponivel" };
    await knowledgeStore.addNote(context?.workspaceId || "default", {
      titulo: dados.titulo,
      conteudo: dados.conteudo,
      tags: dados.tags,
      tipoConhecimento: dados.tipoConhecimento,
    });
    return { ok: true, tipo, result: "Nota salva" };
  }

  if (tipo === "executar_shell") {
    if (process.env.KIARA_ENABLE_SHELL !== "1") {
      return { ok: false, tipo, result: "Shell desativado (set KIARA_ENABLE_SHELL=1)" };
    }

    const cmd = String(dados.cmd || "").trim();
    if (!cmd) return { ok: false, tipo, result: "Comando vazio" };

    const [bin, ...args] = cmd.split(/\s+/);
    const allowed = new Set(["node", "npm", "pnpm", "yarn", "git", "python", "python3"]);
    if (!allowed.has(bin)) {
      return { ok: false, tipo, result: `Binario nao permitido: ${bin}` };
    }

    const { stdout, stderr } = await execFileAsync(bin, args, { cwd: baseDir, timeout: 60_000 });
    const out = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { ok: true, tipo, result: truncate(out, 9000) || "(sem saida)" };
  }

  return { ok: false, tipo, result: "Acao desconhecida" };
}
