import { extractSearchTerms } from "./textSearch.js";

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function uniqueActions(actions) {
  const seen = new Set();
  const output = [];
  for (const action of actions || []) {
    const key = JSON.stringify({ tipo: action?.tipo || "", dados: action?.dados || {} });
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(action);
  }
  return output;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickVariant(seed, options) {
  const list = Array.isArray(options) ? options.filter(Boolean) : [];
  if (!list.length) return "";
  const text = String(seed || "");
  const score = [...text].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return list[score % list.length];
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.:/-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGreeting(text) {
  const lower = normalizeText(text);
  return /^(oi|ola|e ai|ei|hey|bom dia|boa tarde|boa noite|kiara)(?:\s+kiara)?[!.? ]*$/.test(lower);
}

function isSmallTalk(text) {
  const lower = normalizeText(text);
  return /^(tudo bem|como voce esta|como vc esta|como voce ta|como vc ta|beleza|blz|valeu|obrigado|obrigada|fala|fala ai|e ai|ta ai|esta ai|quem e voce|quem eh voce)[!.? ]*$/.test(lower);
}

function isDateTimeQuery(text) {
  const lower = normalizeText(text);
  return /\b(que dia e hoje|qual e a data de hoje|qual a data de hoje|que data e hoje|data de hoje|que horas sao|que horas sao agora|qual a hora|qual e a hora|hora agora|dia de hoje)\b/.test(lower);
}

export function isInstructionalQuery(text) {
  const lower = normalizeText(text);
  return /\b(qual comando|que comando|como faco|como fazer|como eu faco|como listar|como ver|como usar|como configuro|como configurar|como instalo|como instalar|como resolvo|como resolver|me ajuda com|me ajude com|me explica|me explique|explica|explique|o que e|o que significa|qual a diferenca|qual e a diferenca)\b/.test(lower);
}

function isDirectCommand(text) {
  const lower = normalizeText(text);
  return /\b(abra|abrir|abre|acessa|pesquise|pesquisa|procure|busque)\b/.test(lower);
}

function capitalize(text) {
  const value = String(text || "");
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function formatLocalDateTime() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(now);
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  return {
    weekday: capitalize(weekday),
    date,
    time,
  };
}

function isComplexCommand(text) {
  const lower = normalizeText(text);
  return /\b(e depois|entao|clique|clicar|preencha|digite|controle|navegue|navegar|site|pagina|formulario|analisar|auditar)\b/.test(lower);
}

function detectUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : "";
}

function resolveNamedSite(text) {
  const lower = normalizeText(text);
  const sites = [
    { pattern: /\bgoogle\b/, url: "https://www.google.com" },
    { pattern: /\byoutube\b/, url: "https://www.youtube.com" },
    { pattern: /\bgmail\b/, url: "https://mail.google.com" },
    { pattern: /\bwhatsapp\b/, url: "https://web.whatsapp.com" },
    { pattern: /\binstagram\b/, url: "https://www.instagram.com" },
    { pattern: /\bfacebook\b/, url: "https://www.facebook.com" },
    { pattern: /\blinkedin\b/, url: "https://www.linkedin.com" },
    { pattern: /\bgithub\b/, url: "https://github.com" },
    { pattern: /\bgoogle drive\b|\bdrive\b/, url: "https://drive.google.com" },
  ];
  return sites.find((item) => item.pattern.test(lower)) || null;
}

function extractMentionedSiteUrls(text) {
  const lower = normalizeText(text);
  const sites = [
    { pattern: /\bgoogle\b/g, url: "https://www.google.com" },
    { pattern: /\byoutube\b/g, url: "https://www.youtube.com" },
    { pattern: /\bgmail\b/g, url: "https://mail.google.com" },
    { pattern: /\bwhatsapp\b/g, url: "https://web.whatsapp.com" },
    { pattern: /\binstagram\b/g, url: "https://www.instagram.com" },
    { pattern: /\bfacebook\b/g, url: "https://www.facebook.com" },
    { pattern: /\blinkedin\b/g, url: "https://www.linkedin.com" },
    { pattern: /\bgithub\b/g, url: "https://github.com" },
    { pattern: /\bgoogle drive\b|\bdrive\b/g, url: "https://drive.google.com" },
  ];

  const found = [];
  for (const site of sites) {
    if (site.pattern.test(lower)) found.push(site.url);
  }
  return [...new Set(found)];
}

function inferSiteUrl(text, fallbackUrl = "") {
  return detectUrl(text) || resolveNamedSite(text)?.url || String(fallbackUrl || "").trim();
}

function inferKnowledgeType(text) {
  const lower = normalizeText(text);
  if (/\b(prefiro|preferencia|sempre|nunca|gosto|nao gosto)\b/.test(lower)) return "preferencia";
  if (/\b(regra|padrao|sempre funciona|nao repetir|nao fazer)\b/.test(lower)) return "padrao";
  if (/\b(empresa|negocio|oferta|cliente|produto|servico)\b/.test(lower)) return "fato";
  return "nota";
}

function buildLearningAction(pergunta) {
  const text = String(pergunta || "").trim();
  const lower = normalizeText(text);

  if (!/\b(lembra|lembre|guarde|anota|anote|prefiro|preferencia|sempre|nunca)\b/.test(lower)) {
    return null;
  }

  const tags = [];
  if (/\b(prefiro|preferencia|sempre|nunca)\b/.test(lower)) tags.push("preferencia");
  if (/\b(marketing|copy|seo|trafego)\b/.test(lower)) tags.push("marketing");
  if (/\b(vendas|proposta|lead|comercial)\b/.test(lower)) tags.push("vendas");
  if (/\b(financ|caixa|margem|orcamento)\b/.test(lower)) tags.push("financas");
  if (/\b(gestao|processo|operacao|prioridade)\b/.test(lower)) tags.push("gestao");
  if (/\b(infra|infraestrutura|linux|docker|container|servidor|nginx|systemd|compose)\b/.test(lower)) tags.push("infraestrutura");

  return {
    tipo: "salvar_nota",
    dados: {
      titulo: "Aprendizado automatico do usuario",
      conteudo: text,
      tags: unique(tags.length ? tags : ["preferencia"]),
      tipoConhecimento: inferKnowledgeType(text),
    },
  };
}

function inferSpecialties(text) {
  const terms = extractSearchTerms(text, { limit: 20 });
  const found = [];
  if (terms.some((t) => ["marketing", "copy", "seo", "trafego", "instagram", "anuncios"].includes(t))) found.push("marketing");
  if (terms.some((t) => ["vendas", "lead", "proposta", "oferta", "pitch", "fechamento", "followup", "pipeline", "crm"].includes(t))) found.push("vendas");
  if (terms.some((t) => ["financas", "financeiro", "caixa", "margem", "lucro", "receita", "precificacao", "inadimplencia", "dre"].includes(t))) found.push("financas");
  if (terms.some((t) => ["gestao", "processo", "operacao", "prioridade", "roadmap", "backlog"].includes(t))) found.push("gestao");
  if (terms.some((t) => ["assistente", "agenda", "organizar", "acompanhar", "pesquisa", "navegar"].includes(t))) found.push("assistente");
  if (terms.some((t) => ["tecnologia", "api", "automacao", "automacoes", "agente", "workflow", "integracao", "backend", "site"].includes(t))) found.push("tecnologia");
  if (terms.some((t) => ["infra", "infraestrutura", "linux", "docker", "container", "containers", "compose", "nginx", "systemd", "servidor"].includes(t))) {
    found.push("infraestrutura");
  }
  if (terms.some((t) => ["zabbix", "trigger", "template", "lld", "proxy", "poller"].includes(t))) found.push("zabbix");
  if (terms.some((t) => ["grafana", "dashboard", "datasource", "loki", "prometheus", "promql", "alerting"].includes(t))) found.push("grafana");
  return unique(found);
}

function shouldDeepResearch(lower) {
  return /\b(a fundo|profundo|detalhado|detalhada|por baixo|investigue|investigacao)\b/.test(lower);
}

function shouldSearch(lower) {
  return /\b(pesquise|pesquisa|procure|busque|investigue|ache|descubra|levantamento)\b/.test(lower);
}

function shouldInspectScreen(lower) {
  return /\b(tela|screen|janela|erro|botao|botao|clico|clico|onde clico|o que voce esta vendo|o que vc esta vendo|o que tem aqui|o que aparece|o que esta aparecendo|analisa isso|ve isso|ve essa tela|olha isso)\b/.test(lower);
}

function inferMissionIntent(lower) {
  return /\b(quero|preciso|meta|objetivo|plano|projeto|missao|organize|resolver|fazer)\b/.test(lower);
}

function cleanSearchQueryLegacy(text) {
  return String(text || "")
    .replace(/\b(pesquise|pesquisa|procure|busque|investigue|ache|descubra)\b/gi, "")
    .replace(/\b(no google|na google|na web|na internet|no youtube|no site)\b/gi, "")
    .replace(/\bsobre\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchIntentQueryLegacy(text) {
  const match =
    String(text || "").match(/\b(?:pesquise|pesquisa|procure|busque)\b\s+(?:por\s+)?["“]?(.+?)["”]?(?:\s*$)/i) ||
    String(text || "").match(/\b(?:pesquisar|procurar|buscar)\b\s+(?:por\s+)?["“]?(.+?)["”]?(?:\s*$)/i);
  return match?.[1]?.trim() || "";
}

function splitChainedCommands(text) {
  return String(text || "")
    .split(/\b(?:e depois|depois|entao|então|em seguida|logo depois|por fim|por ultimo|por último)\b|,\s*(?=(?:abra|abrir|abre|pesquise|pesquisa|procure|busque|pressione|aperte|copie|copiar|acessa|acessar|inicie|iniciar|inicia)\b)|\se\s+(?=(?:abra|abrir|abre|pesquise|pesquisa|procure|busque|pressione|aperte|copie|copiar|acessa|acessar|inicie|iniciar|inicia)\b)/gi)
    .map((part) => part.trim().replace(/^,\s*|\s*,$/g, ""))
    .filter(Boolean);
}

// Override das funcoes de busca para limpar melhor preposicoes residuais e
// permitir colapsar sequencias como "abrir o google e pesquisar por X".
function cleanSearchQuery(text) {
  return String(text || "")
    .replace(/\b(pesquise|pesquisa|procure|busque|investigue|ache|descubra)\b/gi, "")
    .replace(/\b(pesquisar|procurar|buscar)\b/gi, "")
    .replace(/\b(no google|na google|na web|na internet|no youtube|no site)\b/gi, "")
    .replace(/\b(sobre|por|pelo|pela|pelos|pelas|pro|pra)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchIntentQuery(text) {
  const source = String(text || "");
  const match =
    source.match(/\b(?:pesquise|pesquisa|procure|busque)\b\s+(?:por|pelo|pela|pelos|pelas|pro|pra)?\s*["“]?(.+?)["”]?(?:\s*$)/i) ||
    source.match(/\b(?:pesquisar|procurar|buscar)\b\s+(?:por|pelo|pela|pelos|pelas|pro|pra)?\s*["“]?(.+?)["”]?(?:\s*$)/i);
  return cleanSearchQuery(match?.[1] || "");
}

function normalizeSearchOpenSequence(actions = []) {
  const list = Array.isArray(actions) ? actions.filter(Boolean) : [];
  const normalized = [];

  for (let index = 0; index < list.length; index++) {
    const current = list[index];
    const next = list[index + 1];

    const isGoogleOpenThenSearch =
      current?.tipo === "abrir_site" &&
      /google\./i.test(String(current?.dados?.url || "")) &&
      next?.tipo === "pesquisa" &&
      String(next?.dados?.query || "").trim();

    const isYoutubeOpenThenSearch =
      current?.tipo === "abrir_site" &&
      /youtube\./i.test(String(current?.dados?.url || "")) &&
      next?.tipo === "youtube_busca" &&
      String(next?.dados?.query || "").trim();

    if (isGoogleOpenThenSearch || isYoutubeOpenThenSearch) {
      normalized.push(next);
      index += 1;
      continue;
    }

    normalized.push(current);
  }

  return uniqueActions(normalized);
}

function tokenizePlanSegments(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const seeded = splitChainedCommands(raw);
  if (seeded.length > 1) return seeded;

  return raw
    .split(/,(?=\s*)/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const normalized = normalizeText(part);
      if (/\b(abra|abrir|abre|pesquise|pesquisa|procure|busque|pressione|aperte|copie|copiar|acessa|acessar|inicie|iniciar|inicia)\b/.test(normalized)) {
        acc.push(part);
      } else if (acc.length) {
        acc[acc.length - 1] = `${acc[acc.length - 1]} ${part}`.trim();
      } else {
        acc.push(part);
      }
      return acc;
    }, []);
}

function extractNamedSiteFromText(text) {
  const named = resolveNamedSite(text);
  if (named?.url) return named.url;
  const explicit = detectUrl(text);
  return explicit || "";
}

function segmentHasActionIntent(text) {
  const lower = normalizeText(text);
  return /\b(abra|abrir|abre|pesquise|pesquisa|procure|busque|pressione|aperte|copie|copiar|acessa|acessar|inicie|iniciar|inicia)\b/.test(lower);
}

function buildSimpleActionFromSegment(segment, previousUrl = "") {
  const text = String(segment || "").trim();
  const lower = normalizeText(text);
  if (!text) return null;

  const browserTargets = extractBrowserTargets(text);
  const windowCount = extractRequestedWindowCount(text);
  const explicitUrls = extractExplicitUrls(text);
  const namedUrls = extractMentionedSiteUrls(text);
  const allUrls = [...new Set([...explicitUrls, ...namedUrls])];

  if (/\b(abra|abrir|abre|acessa|acessar|inicie|iniciar|inicia)\b/.test(lower) && windowCount >= 2 && browserTargets.length >= 1) {
    return {
      tipo: "desktop_abrir_janelas_browser",
      dados: {
        app: browserTargets[0].app,
        count: windowCount,
        urls: allUrls,
      },
    };
  }

  if (/\b(abra|abrir|abre|acessa|acessar|inicie|iniciar|inicia)\b/.test(lower) && allUrls.length >= 2) {
    if (!browserTargets.length) {
      return { tipo: "desktop_abrir_links", dados: { urls: allUrls } };
    }

    return {
      tipo: "desktop_abrir_multiplos",
      dados: {
        launches: buildMultiBrowserLaunches(browserTargets, allUrls),
      },
    };
  }

  const namedSite = resolveNamedSite(lower);
  const explicitUrl = detectUrl(text);
  const targetUrl = explicitUrl || namedSite?.url || previousUrl || "";
  const searchQuery = extractSearchIntentQuery(text) || cleanSearchQuery(text);

  if (/\b(pesquise|pesquisa|procure|busque|pesquisar|procurar|buscar)\b/.test(lower)) {
    if (/youtube\./i.test(targetUrl)) {
      return { tipo: "youtube_busca", dados: { query: searchQuery || text } };
    }
    if (/google\./i.test(targetUrl) || !targetUrl) {
      return { tipo: "pesquisa", dados: { query: searchQuery || text } };
    }
    return {
      tipo: "browser_run",
      dados: {
        url: targetUrl,
        objetivo: text,
        query: searchQuery || text,
        steps: [],
      },
    };
  }

  if (/\b(abra|abrir|abre|acessa|acessar)\b/.test(lower) && targetUrl) {
    return { tipo: "abrir_site", dados: { url: targetUrl } };
  }

  if (/\b(copie|copiar|copia)\b/.test(lower)) {
    const copyMatch = text.match(/\b(?:copie|copiar|copia)\s+(.+)$/i);
    if (copyMatch?.[1]) {
      return { tipo: "desktop_copiar_texto", dados: { text: copyMatch[1].trim() } };
    }
  }

  if (/\b(pressione|pressionar|aperte|atalho)\b/.test(lower)) {
    const keyRules = [
      { pattern: /\benter\b/, keys: "{ENTER}" },
      { pattern: /\btab\b/, keys: "{TAB}" },
      { pattern: /\besc\b|\bescape\b/, keys: "{ESC}" },
      { pattern: /\bctrl l\b|\bcontrol l\b/, keys: "^l" },
      { pattern: /\balt tab\b/, keys: "%{TAB}" },
      { pattern: /\bctrl c\b|\bcontrol c\b/, keys: "^c" },
      { pattern: /\bctrl v\b|\bcontrol v\b/, keys: "^v" },
    ];
    const matchedKey = keyRules.find((item) => item.pattern.test(lower));
    if (matchedKey) {
      return { tipo: "desktop_enviar_teclas", dados: { keys: matchedKey.keys } };
    }
  }

  return null;
}

function buildLocalActionPlan(text) {
  const segments = tokenizePlanSegments(text);
  if (!segments.length) return [];

  const actions = [];
  let lastUrl = "";
  for (const segment of segments) {
    if (!segmentHasActionIntent(segment) && !lastUrl) continue;
    const action = buildSimpleActionFromSegment(segment, lastUrl);
    const segmentUrl = extractNamedSiteFromText(segment);
    if (segmentUrl) lastUrl = segmentUrl;
    if (!action) continue;
    if (action.tipo === "abrir_site" && action.dados?.url) lastUrl = action.dados.url;
    if (action.tipo === "browser_run" && action.dados?.url) lastUrl = action.dados.url;
    actions.push(action);
  }

  return normalizeSearchOpenSequence(actions);
}

function conversationalAck(seed, kind = "default") {
  const variants = {
    greeting: [
      "Oi. Estou aqui.",
      "Oi. Pode falar.",
      "Oi. Estou com voce.",
    ],
    action: [
      "Certo.",
      "Entendi.",
      "Perfeito.",
    ],
    default: [
      "Entendi.",
      "Certo.",
      "Faz sentido.",
      "Estou com isso.",
    ],
    analysis: [
      "Entendi o ponto.",
      "Ja vi o foco aqui.",
      "Deixa eu ir direto no que importa.",
    ],
  };

  return pickVariant(seed + ":" + kind, variants[kind] || variants.default);
}

function conversationalBridge(seed, kind = "default") {
  const variants = {
    greeting: [
      "Pode me passar o objetivo.",
      "Me diga no que quer que eu entre agora.",
      "Se quiser, eu ja sigo com a primeira tarefa.",
    ],
    action: [
      "Ja estou nisso.",
      "Vou resolver essa parte agora.",
      "Deixa comigo.",
    ],
    analysis: [
      "Tem um ponto principal aqui.",
      "O centro da questao e este.",
      "Vou te devolver isso de forma direta.",
      "Tem uma leitura bem clara aqui.",
    ],
    support: [
      "Vou simplificar isso.",
      "Vamos por partes.",
      "Eu te conduzo nessa.",
    ],
    close: [
      "Se quiser, eu continuo daqui.",
      "Se fizer sentido, eu ja sigo para o proximo passo.",
      "Se voce quiser, eu aprofundo agora.",
    ],
  };

  return pickVariant(seed + ":bridge:" + kind, variants[kind] || variants.analysis);
}

function conversationalLine(seed, kind = "default") {
  const ack = conversationalAck(seed, kind === "support" ? "default" : kind);
  const bridge = conversationalBridge(seed, kind);
  return [ack, bridge].filter(Boolean).join(" ");
}

function humanizeSiteName(urlOrText) {
  const text = String(urlOrText || "").trim();
  if (!text) return "o site";

  try {
    const parsed = new URL(text);
    const host = parsed.hostname.replace(/^www\./i, "");
    if (/google\./i.test(host)) return "o Google";
    if (/youtube\./i.test(host)) return "o YouTube";
    if (/instagram\./i.test(host)) return "o Instagram";
    if (/facebook\./i.test(host)) return "o Facebook";
    if (/linkedin\./i.test(host)) return "o LinkedIn";
    if (/github\./i.test(host)) return "o GitHub";
    if (/drive\.google\./i.test(host)) return "o Google Drive";
    if (/mail\.google\./i.test(host)) return "o Gmail";
    if (/whatsapp\./i.test(host)) return "o WhatsApp";
    return `o site ${host}`;
  } catch {
    const namedSite = resolveNamedSite(text);
    if (namedSite?.url) return humanizeSiteName(namedSite.url);
    return text;
  }
}

function extractExplicitUrls(text) {
  return [...String(text || "").matchAll(/https?:\/\/[^\s]+/gi)].map((match) => match[0]);
}

function extractBrowserTargets(text) {
  const lower = normalizeText(text);
  const rules = [
    { pattern: /\bchrome\b/, app: "chrome", label: "Chrome" },
    { pattern: /\bedge\b/, app: "edge", label: "Edge" },
    { pattern: /\bfirefox\b/, app: "firefox", label: "Firefox" },
  ];
  return rules.filter((item) => item.pattern.test(lower));
}

function extractRequestedWindowCount(text) {
  const direct = String(text || "").match(/\b(\d{1,2})\s+(?:janelas|janelas?\s+separadas|abas)\b/i);
  if (direct?.[1]) return Math.max(1, Math.min(Number(direct[1]), 12));

  const wordMap = new Map([
    ["uma", 1],
    ["um", 1],
    ["duas", 2],
    ["dois", 2],
    ["tres", 3],
    ["três", 3],
    ["quatro", 4],
    ["cinco", 5],
    ["seis", 6],
    ["sete", 7],
    ["oito", 8],
    ["nove", 9],
    ["dez", 10],
  ]);

  const lower = normalizeText(text);
  for (const [word, value] of wordMap.entries()) {
    const pattern = new RegExp(`\\b${word}\\s+(?:janelas|abas)\\b`);
    if (pattern.test(lower)) return value;
  }

  return 0;
}

function buildMultiBrowserLaunches(browsers = [], urls = []) {
  const browserApps = [...new Set((browsers || []).map((item) => item.app).filter(Boolean))];
  const uniqueUrls = [...new Set((urls || []).filter(Boolean))];
  if (!browserApps.length) return [];
  if (!uniqueUrls.length) {
    return browserApps.map((app) => ({ app, args: [] }));
  }

  if (browserApps.length === 1) {
    return [{ app: browserApps[0], args: uniqueUrls }];
  }

  if (uniqueUrls.length === 1) {
    return browserApps.map((app) => ({ app, args: [uniqueUrls[0]] }));
  }

  if (browserApps.length === uniqueUrls.length) {
    return browserApps.map((app, index) => ({ app, args: [uniqueUrls[index]] }));
  }

  return browserApps.map((app, index) => ({
    app,
    args: uniqueUrls.filter((_, urlIndex) => urlIndex % browserApps.length === index),
  })).filter((item) => item.args.length);
}

function directCommandResponse(pergunta) {
  const text = String(pergunta || "").trim();
  const lower = normalizeText(text);
  const plannedActions = buildLocalActionPlan(text);
  if (plannedActions.length >= 2) {
    const ack = conversationalAck(text, "action");
    return {
      texto: `${ack} Posso executar essa sequencia em ordem agora.`,
      fala: `${ack} Posso seguir essa sequencia agora.`,
      acoes: plannedActions,
    };
  }

  const appRules = [
    { pattern: /\b(vscode|vs code|visual studio code)\b/, app: "vscode", label: "o VS Code" },
    { pattern: /\b(obsidian)\b/, app: "obsidian", label: "o Obsidian" },
    { pattern: /\b(explorer|explorador de arquivos|explorador)\b/, app: "explorer", label: "o Explorador de Arquivos" },
    { pattern: /\b(bloco de notas|notepad)\b/, app: "notepad", label: "o Bloco de Notas" },
    { pattern: /\b(powershell)\b/, app: "powershell", label: "o PowerShell" },
    { pattern: /\b(terminal|windows terminal)\b/, app: "terminal", label: "o Terminal" },
    { pattern: /\b(chrome)\b/, app: "chrome", label: "o Chrome" },
    { pattern: /\b(edge)\b/, app: "edge", label: "o Edge" },
    { pattern: /\b(firefox)\b/, app: "firefox", label: "o Firefox" },
    { pattern: /\b(spotify)\b/, app: "spotify", label: "o Spotify" },
    { pattern: /\b(discord)\b/, app: "discord", label: "o Discord" },
  ];

  const browsers = extractBrowserTargets(text);
  const explicitUrls = extractExplicitUrls(text);
  const mentionedSiteUrls = extractMentionedSiteUrls(text);
  const allUrls = [...new Set([...explicitUrls, ...mentionedSiteUrls])];
  const hasOpenIntent = /\b(abra|abrir|abre|inicie|iniciar|inicia|acessa|acessar)\b/.test(lower);
  const hasSearchIntent = /\b(pesquise|pesquisa|procure|busque|pesquisar|procurar|buscar)\b/.test(lower);
  const requestedWindowCount = extractRequestedWindowCount(text);

  if (hasOpenIntent && requestedWindowCount >= 2 && browsers.length >= 1) {
    const browser = browsers[0];
    const ack = conversationalAck(text, "action");
    return {
      texto: `${ack} Posso abrir ${requestedWindowCount} janelas separadas no ${browser.label} agora.`,
      fala: `${ack} Posso abrir ${requestedWindowCount} janelas agora.`,
      acoes: [{
        tipo: "desktop_abrir_janelas_browser",
        dados: {
          app: browser.app,
          count: requestedWindowCount,
          urls: allUrls,
        },
      }],
    };
  }

  if (hasOpenIntent && allUrls.length >= 2) {
    const ack = conversationalAck(text, "action");
    if (!browsers.length) {
      return {
        texto: `${ack} Posso abrir ${allUrls.length} sites em paralelo agora.`,
        fala: `${ack} Posso abrir esses sites em paralelo agora.`,
        acoes: [{ tipo: "desktop_abrir_links", dados: { urls: allUrls } }],
      };
    }

    const launches = buildMultiBrowserLaunches(browsers, allUrls);
    return {
      texto: `${ack} Posso abrir ${allUrls.length} sites em paralelo agora.`,
      fala: `${ack} Posso abrir esses sites em paralelo agora.`,
      acoes: [{ tipo: "desktop_abrir_multiplos", dados: { launches } }],
    };
  }

  if (hasOpenIntent && (browsers.length >= 2 || (browsers.length >= 1 && allUrls.length >= 1))) {
    const launches = buildMultiBrowserLaunches(browsers, allUrls);
    if (launches.length >= 2 || (launches.length === 1 && launches[0].args.length >= 2)) {
      const ack = conversationalAck(text, "action");
      const browserNames = browsers.map((item) => item.label).join(", ");
      return {
        texto: `${ack} Posso abrir varios navegadores e sites em paralelo agora${browserNames ? `: ${browserNames}` : ""}.`,
        fala: `${ack} Posso abrir tudo isso em paralelo agora.`,
        acoes: [{ tipo: "desktop_abrir_multiplos", dados: { launches } }],
      };
    }
  }

  if (hasOpenIntent) {
    const matchedApp = appRules.find((item) => item.pattern.test(lower));
    if (matchedApp) {
      const ack = conversationalAck(text, "action");
      return {
        texto: `${ack} Posso abrir ${matchedApp.label} no seu desktop agora.`,
        fala: `${ack} Posso abrir ${matchedApp.label} agora.`,
        acoes: [{ tipo: "desktop_abrir_app", dados: { app: matchedApp.app } }],
      };
    }

    const pathMatch = text.match(/\b(?:abra|abrir|abre)\s+(?:a\s+)?(?:pasta|arquivo|diretorio|diret[oó]rio)\s+(.+)$/i);
    if (pathMatch?.[1]) {
      const ack = conversationalAck(text, "action");
      return {
        texto: `${ack} Posso abrir esse caminho local agora.`,
        fala: `${ack} Posso abrir esse caminho agora.`,
        acoes: [{ tipo: "desktop_abrir_caminho", dados: { path: pathMatch[1].trim() } }],
      };
    }
  }

  const copyMatch = text.match(/\b(?:copie|copiar|copia)\s+(.+)$/i);
  if (copyMatch?.[1]) {
    const ack = conversationalAck(text, "action");
    return {
      texto: `${ack} Posso copiar isso para a area de transferencia.`,
      fala: `${ack} Posso copiar isso agora.`,
      acoes: [{ tipo: "desktop_copiar_texto", dados: { text: copyMatch[1].trim() } }],
    };
  }

  if (/\b(pressione|pressionar|aperte|atalho)\b/.test(lower)) {
    const keyRules = [
      { pattern: /\benter\b/, keys: "{ENTER}", label: "Enter" },
      { pattern: /\btab\b/, keys: "{TAB}", label: "Tab" },
      { pattern: /\besc\b|\bescape\b/, keys: "{ESC}", label: "Escape" },
      { pattern: /\bctrl l\b|\bcontrol l\b/, keys: "^l", label: "Ctrl+L" },
      { pattern: /\balt tab\b/, keys: "%{TAB}", label: "Alt+Tab" },
      { pattern: /\bctrl c\b|\bcontrol c\b/, keys: "^c", label: "Ctrl+C" },
      { pattern: /\bctrl v\b|\bcontrol v\b/, keys: "^v", label: "Ctrl+V" },
    ];
    const matchedKey = keyRules.find((item) => item.pattern.test(lower));
    if (matchedKey) {
      const ack = conversationalAck(text, "action");
      return {
        texto: `${ack} Posso enviar ${matchedKey.label} para a janela ativa.`,
        fala: `${ack} Posso enviar ${matchedKey.label} agora.`,
        acoes: [{ tipo: "desktop_enviar_teclas", dados: { keys: matchedKey.keys } }],
      };
    }
  }

  const namedSite = resolveNamedSite(lower);

  if (hasOpenIntent && hasSearchIntent && namedSite?.url) {
    const query = extractSearchIntentQuery(text) || cleanSearchQuery(text) || text;
    const ack = conversationalAck(text, "action");

    if (/google\./i.test(namedSite.url)) {
      return {
        texto: `${ack} Vou pesquisar "${query}" no Google agora.`,
        fala: `${ack} Vou pesquisar isso no Google agora.`,
        acoes: [{ tipo: "pesquisa", dados: { query } }],
      };
    }

    if (/youtube\./i.test(namedSite.url)) {
      return {
        texto: `${ack} Vou pesquisar "${query}" no YouTube agora.`,
        fala: `${ack} Vou pesquisar isso no YouTube agora.`,
        acoes: [{ tipo: "youtube_busca", dados: { query } }],
      };
    }

    return {
      texto: `${ack} Posso abrir ${humanizeSiteName(namedSite.url)} e pesquisar isso agora.`,
      fala: `${ack} Posso abrir esse site e pesquisar isso agora.`,
      acoes: [{
        tipo: "browser_run",
        dados: {
          url: namedSite.url,
          objetivo: text,
          query,
          steps: [],
        },
      }],
    };
  }

  if (namedSite && /\b(abra|abrir|abre|acessa|abrir o|abrir a)\b/.test(lower)) {
    const ack = conversationalAck(text, "action");
    return {
      texto: `${ack} Vou abrir ${humanizeSiteName(namedSite.url)} agora.`,
      fala: `${ack} Vou abrir ${humanizeSiteName(namedSite.url)} agora.`,
      acoes: [{ tipo: "abrir_site", dados: { url: namedSite.url } }],
    };
  }

  if (/\b(abra|abrir|abre)\b/.test(lower) && /\bhttps?:\/\//.test(lower)) {
    const url = detectUrl(text);
    const ack = conversationalAck(text, "action");
    return {
      texto: `${ack} Vou abrir ${humanizeSiteName(url)} agora.`,
      fala: `${ack} Vou abrir ${humanizeSiteName(url)} agora.`,
      acoes: [{ tipo: "abrir_site", dados: { url } }],
    };
  }

  if (/\b(pesquise|pesquisa|procure|busque)\b/.test(lower) && !/\b(a fundo|profundo|detalhado|detalhada)\b/.test(lower)) {
    const cleanedQuery = cleanSearchQuery(text) || text;
    const ack = conversationalAck(cleanedQuery, "action");
    return {
      texto: `${ack} Vou pesquisar "${cleanedQuery}" e te trazer o que importar.`,
      fala: `${ack} Vou pesquisar isso agora e ja te resumo o que importar.`,
      acoes: [{ tipo: "pesquisa", dados: { query: cleanedQuery } }],
    };
  }

  return null;
}

function buildBrowserAction(question, lower, fallbackUrl = "") {
  const url = inferSiteUrl(question, fallbackUrl);
  if (!url) return null;

  const queryMatch =
    question.match(/\b(?:pesquise|procure|busque)\b\s+["“]?(.+?)["”]?(?:\s+\b(?:no|na|em)\b.+)?$/i) ||
    question.match(/\b(?:pesquisar|procurar)\b\s+por\s+["“]?(.+?)["”]?$/i);
  const query = queryMatch?.[1]?.trim() || "";

  if (!query && !/\b(clique|clicar|preencha|digite|controle|navegue|navegar|site|pagina|formulario)\b/.test(lower)) {
    return null;
  }

  return {
    tipo: "browser_run",
    dados: {
      url,
      objetivo: question,
      query,
      steps: [],
    },
  };
}

function buildActionPlan(pergunta, { alocacaoUrl }) {
  const text = String(pergunta || "").trim();
  const lower = normalizeText(text);
  const explicitUrl = detectUrl(text);
  const namedSite = resolveNamedSite(text);
  const url = explicitUrl || namedSite?.url || alocacaoUrl || "";
  const actions = [];

  if (/\b(abrir site|abra site|abrir o site|abre o site)\b/.test(lower) && url) {
    actions.push({ tipo: "abrir_site", dados: { url } });
  }

  if (/\b(youtube|video)\b/.test(lower) && /\b(busca|pesquis|procura|ache)\b/.test(lower)) {
    actions.push({ tipo: "youtube_busca", dados: { query: cleanSearchQuery(text) || text } });
  }

  const browserAction = buildBrowserAction(text, lower, alocacaoUrl);
  if (browserAction) actions.push(browserAction);

  if (shouldSearch(lower)) {
    const cleanedQuery = cleanSearchQuery(text) || text;
    actions.push({
      tipo: "pesquisar_web",
      dados: {
        query: cleanedQuery,
        profundo: shouldDeepResearch(lower),
        pageLimit: shouldDeepResearch(lower) ? 5 : 3,
      },
    });
  }

  if (url && /\b(auditoria|auditar|diagnostico|seo|site)\b/.test(lower)) {
    actions.push({ tipo: "site_audit", dados: { url, maxPages: 6 } });
  }

  if (/\b(criar automacao|crie automacao|automatize|agente para|playbook)\b/.test(lower)) {
    actions.push({
      tipo: "criar_automacao",
      dados: {
        nome: "automacao-kiara",
        objetivo: text,
        url,
        passos: [
          "Entender objetivo do usuario",
          "Mapear entradas, decisoes e saidas",
          "Executar e registrar aprendizados",
        ],
      },
    });
  }

  const learning = buildLearningAction(text);
  if (learning) actions.push(learning);

  return unique(actions.map((action) => JSON.stringify(action))).map((item) => JSON.parse(item));
}

function summarizeKnowledge(knowledge) {
  const text = String(knowledge || "").trim();
  if (!text) return "";
  return text.split("\n").slice(0, 12).join("\n");
}

function detectNeedFollowUp(toolContext, pergunta) {
  const lowerContext = normalizeText(toolContext);
  const lowerQuestion = normalizeText(pergunta);

  if (!lowerContext.trim()) return null;
  if (/\bsem resultados\b|\bnenhuma\b|\bfalha\b|\burl invalida\b/.test(lowerContext)) {
    return {
      tipo: "pesquisar_web",
      dados: {
        query: cleanSearchQuery(pergunta) || pergunta,
        profundo: true,
        pageLimit: 5,
      },
    };
  }

  if (/\bpesquisa profunda\b/.test(lowerContext) && /\b(fonte|pagina|url)\b/.test(lowerContext)) {
    return null;
  }

  if (/\bconcorrente|mercado|benchmark|pesquisa\b/.test(lowerQuestion) && !/\bpesquisa profunda\b/.test(lowerContext)) {
    return {
      tipo: "pesquisar_web",
      dados: {
        query: cleanSearchQuery(pergunta) || pergunta,
        profundo: true,
        pageLimit: 5,
      },
    };
  }

  return null;
}

function inferLearnedActions(question, patterns = []) {
  const lower = normalizeText(question);
  const items = Array.isArray(patterns) ? patterns : [];
  const matched = [];

  for (const item of items) {
    if (!["alta", "media"].includes(String(item?.confidence || ""))) continue;
    const action = item?.action;
    if (!action?.tipo) continue;

    const haystack = normalizeText([item.summary, item.lastQuestion, ...(item.terms || [])].join(" "));
    const directMatch = String(action.tipo).startsWith("desktop_") && (
      /\b(abra|abrir|abre|copie|copiar|pressione|aperte|atalho)\b/.test(lower) ||
      (item.terms || []).some((term) => lower.includes(String(term || "").toLowerCase()))
    );
    const lexicalOverlap = haystack && lower && (haystack.includes(lower) || lower.split(" ").some((term) => term.length >= 4 && haystack.includes(term)));

    if (directMatch || lexicalOverlap) {
      matched.push(action);
    }
  }

  return uniqueActions(matched).slice(0, 3);
}

function inferLearnedSequence(question, sequences = []) {
  const lower = normalizeText(question);
  const items = Array.isArray(sequences) ? sequences : [];

  for (const item of items) {
    if (String(item?.confidence || "") !== "alta") continue;
    const haystack = normalizeText([item.summary, item.lastQuestion, ...(item.terms || [])].join(" "));
    const overlap = lower.split(" ").filter((term) => term.length >= 4 && haystack.includes(term)).length;
    if (overlap >= 2 || (haystack && haystack.includes(lower))) {
      const actions = Array.isArray(item.actions) ? item.actions.filter((action) => action?.tipo) : [];
      if (actions.length >= 2) return uniqueActions(actions).slice(0, 5);
    }
  }

  return [];
}

function inferSkillActions(question, skills = []) {
  const lower = normalizeText(question);
  const items = Array.isArray(skills) ? skills : [];
  const matched = [];

  for (const item of items) {
    if (!["alta", "media"].includes(String(item?.confidence || ""))) continue;
    const actions = Array.isArray(item?.actions) ? item.actions.filter((action) => action?.tipo) : [];
    if (!actions.length) continue;
    const haystack = normalizeText([item.summary, item.lastQuestion, ...(item.terms || []), ...(item.triggers || [])].join(" "));
    const overlap = lower.split(" ").filter((term) => term.length >= 4 && haystack.includes(term)).length;
    if (overlap >= 2 || (haystack && haystack.includes(lower))) {
      matched.push(...actions);
    }
  }

  return uniqueActions(matched).slice(0, 5);
}

function inferLearnedAnswer(question, answers = []) {
  const lower = normalizeText(question);
  const items = Array.isArray(answers) ? answers : [];
  for (const item of items) {
    if (!["alta", "media"].includes(String(item?.confidence || ""))) continue;
    const haystack = normalizeText([item.question, ...(item.terms || [])].join(" "));
    const overlap = lower.split(" ").filter((term) => term.length >= 4 && haystack.includes(term)).length;
    if (item?.key === lower || overlap >= 2 || (haystack && haystack.includes(lower))) {
      const answer = String(item?.answer || "").trim();
      if (answer) return { key: item.key, answer };
    }
  }
  return null;
}

export function assessLocalRoute({ pergunta, context = {} }) {
  const text = String(pergunta || "").trim();
  const lower = normalizeText(text);
  const direct = directCommandResponse(text);
  const actionPlan = buildActionPlan(text, context);
  const learnedSequence = inferLearnedSequence(text, context?.learnedActionSequences || []);
  const learnedActions = inferLearnedActions(text, context?.learnedActionPatterns || []);
  const skillActions = inferSkillActions(text, context?.relevantSkills || []);
  const hasScreenIntent = Boolean(context?.hasScreenFrame) && shouldInspectScreen(lower);

  let score = 0.1;
  const reasons = [];

  if (isGreeting(text) || isSmallTalk(text)) {
    score = 1;
    reasons.push("social-shortcut");
  }
  if (isDateTimeQuery(text)) {
    score = 1;
    reasons.push("datetime-shortcut");
  }
  if (inferLearnedAnswer(text, context?.learnedAnswers || [])) {
    score += 0.42;
    reasons.push("learned-answer");
  }
  if (isInstructionalQuery(text)) {
    score += 0.18;
    reasons.push("instructional-query");
  }
  if (direct) {
    score += 0.6;
    reasons.push("direct-command");
  }
  if (actionPlan.length) {
    score += 0.25;
    reasons.push("local-plan");
  }
  if (skillActions.length) {
    score += 0.35;
    reasons.push("matched-skill");
  }
  if (learnedSequence.length) {
    score += 0.25;
    reasons.push("learned-sequence");
  }
  if (learnedActions.length) {
    score += 0.2;
    reasons.push("learned-action");
  }
  if (hasScreenIntent) {
    score += 0.2;
    reasons.push("screen-context");
  }
  if (/\b(abra|abrir|abre|acessa|acessar|pesquise|pesquisa|procure|busque|copie|copiar|pressione|aperte)\b/.test(lower)) {
    score += 0.15;
    reasons.push("imperative");
  }
  if (!direct && !actionPlan.length && !skillActions.length && !learnedSequence.length && !learnedActions.length && /\?$/.test(text)) {
    score -= 0.15;
    reasons.push("open-question");
  }

  const confidence = clamp(score, 0, 1);
  return {
    confidence,
    shouldHandleLocally: confidence >= 0.55,
    reasons,
    actionCount: uniqueActions([...skillActions, ...learnedSequence, ...learnedActions, ...actionPlan]).length,
  };
}

export async function localChatCompletion({
  pergunta,
  conhecimento,
  memoria,
  memoriaPersistente,
  conversaRecente,
  agencyRef,
  toolContext = "",
  context = {},
}) {
  if (isGreeting(pergunta)) {
    const opening = conversationalAck(pergunta, "greeting");
    const payload = {
      texto: `${opening} Pode falar.`,
      fala: opening,
      acoes: [],
    };
    return {
      content: JSON.stringify(payload),
      raw: JSON.stringify(payload),
      provider: "local",
      model: "heuristic-local-brain",
    };
  }

  if (isSmallTalk(pergunta)) {
    const lower = normalizeText(pergunta);
    let fala = "Pode falar.";
    if (/^tudo bem|^como voce|^como vc/.test(lower)) fala = "Tudo certo. Pode falar.";
    else if (/^valeu|^obrigad/.test(lower)) fala = "Claro.";
    else if (/^quem e voce|^quem eh voce/.test(lower)) fala = "Sou a Kiara.";
    else if (/^beleza|^blz/.test(lower)) fala = "Beleza.";
    else if (/^fala|^e ai/.test(lower)) fala = "Estou aqui.";

    const payload = {
      texto: fala,
      fala,
      acoes: [],
    };
    return {
      content: JSON.stringify(payload),
      raw: JSON.stringify(payload),
      provider: "local",
      model: "heuristic-local-brain",
    };
  }

  if (isDateTimeQuery(pergunta)) {
    const lower = normalizeText(pergunta);
    const { weekday, date, time } = formatLocalDateTime();
    const wantsTime = /\b(hora|horas)\b/.test(lower);
    const wantsDate = /\b(dia|data|hoje)\b/.test(lower) || !wantsTime;
    const textParts = [];
    const speechParts = [];

    if (wantsDate) {
      textParts.push(`Hoje e ${weekday}, ${date}.`);
      speechParts.push(`${weekday}, ${date}.`);
    }
    if (wantsTime) {
      textParts.push(`Agora sao ${time}.`);
      speechParts.push(`Agora sao ${time}.`);
    }

    const payload = {
      texto: textParts.join(" ").trim(),
      fala: speechParts.join(" ").trim(),
      acoes: [],
    };
    return {
      content: JSON.stringify(payload),
      raw: JSON.stringify(payload),
      provider: "local",
      model: "heuristic-local-brain",
    };
  }

  const learnedAnswer = inferLearnedAnswer(pergunta, context?.learnedAnswers || []);
  if (learnedAnswer && (isInstructionalQuery(pergunta) || !isDirectCommand(pergunta))) {
    const payload = {
      texto: learnedAnswer.answer,
      fala: learnedAnswer.answer,
      acoes: [],
      aprendizado: { reusedAnswerKey: learnedAnswer.key },
    };
    return {
      content: JSON.stringify(payload),
      raw: JSON.stringify(payload),
      provider: "local",
      model: "heuristic-local-brain",
    };
  }

  const direct = directCommandResponse(pergunta);
  if (direct) {
      const payload = {
        texto: direct.texto,
        fala: direct.fala || direct.texto,
        acoes: direct.acoes,
      };
    return {
      content: JSON.stringify(payload),
      raw: JSON.stringify(payload),
      provider: "local",
      model: "heuristic-local-brain",
    };
  }

  const specialties = inferSpecialties(pergunta);
  const lower = normalizeText(pergunta);
  const skillActions = inferSkillActions(pergunta, context?.relevantSkills || []);
  let actions = buildActionPlan(pergunta, context);
  const learnedSequence = inferLearnedSequence(pergunta, context?.learnedActionSequences || []);
  const learnedActions = inferLearnedActions(pergunta, context?.learnedActionPatterns || []);
  if (skillActions.length || learnedSequence.length || learnedActions.length) {
    actions = uniqueActions([...skillActions, ...learnedSequence, ...learnedActions, ...actions]);
  }
  if (context?.hasScreenFrame && shouldInspectScreen(lower)) {
    actions = unique([
      ...actions.map((item) => JSON.stringify(item)),
      JSON.stringify({ tipo: "ver_tela", dados: { pergunta: pergunta } }),
    ]).map((item) => JSON.parse(item));
  }
  const followUp = detectNeedFollowUp(toolContext, pergunta);
  if (followUp) actions = unique([...actions.map((a) => JSON.stringify(a)), JSON.stringify(followUp)]).map((item) => JSON.parse(item));

  const isCommandLike = /\b(abra|abrir|abre|pesquise|pesquisa|procure|busque|faca|crie|automatize)\b/.test(lower);
  const responseParts = [];
  const baseAck = conversationalAck(pergunta, isCommandLike ? "action" : "analysis");
  const baseBridge = conversationalBridge(pergunta, isCommandLike ? "action" : "analysis");

  if (specialties.length) {
    responseParts.push(`${baseAck} ${baseBridge} Vou tratar isso com foco em ${specialties.join(", ")}.`);
  } else if (!isCommandLike) {
    responseParts.push(`${baseAck} ${baseBridge} Vou organizar isso de forma pratica e objetiva.`);
  }

  const workspaceExpertiseSummary = String(context?.workspaceExpertiseSummary || "").trim();
  if (workspaceExpertiseSummary && !isCommandLike) {
    responseParts.push(`Tambem vou aproveitar a especializacao acumulada neste workspace: ${workspaceExpertiseSummary}.`);
  }

  const relevantPlaybooks = String(context?.relevantPlaybooks || "").trim();
  if (relevantPlaybooks && !isCommandLike) {
    responseParts.push("Tambem vou reutilizar playbooks e automacoes que ja deram certo neste workspace.");
  }

  const specialistNotes = String(context?.specialistNotes || "").trim();
  if (specialistNotes && !isCommandLike) {
    responseParts.push("Ja encontrei casos anteriores que ajudam a encurtar o caminho.");
  }

  const agencyRoster = String(context?.agencyRoster || "").trim();
  if (agencyRoster && !isCommandLike) {
    responseParts.push(`Ativei estes especialistas para pensar comigo: ${agencyRoster}.`);
  }

  const knowledgeSummary = isGreeting(pergunta) ? "" : summarizeKnowledge(conhecimento);
  if (knowledgeSummary) {
    responseParts.push("Encontrei contexto local que ajuda na resposta.");
  } else if (!isCommandLike && String(memoriaPersistente || memoria || conversaRecente || "").trim()) {
    responseParts.push("Tambem vou considerar o que ja apareceu na conversa e na memoria recente.");
  }

  if (toolContext) {
    responseParts.push("Revisei o resultado das acoes anteriores antes de decidir o proximo passo.");
  }

  if (actions.length) {
    responseParts.push("Ja montei um plano de acoes automaticas para avancar sem depender de improviso.");
    if (learnedSequence.length) {
      responseParts.push("Tambem encontrei uma sequencia que ja funcionou antes e vou reutilizar essa rotina.");
    } else if (skillActions.length) {
      responseParts.push("Tambem encontrei uma skill local aderente e vou reutilizar essa rotina aprendida.");
    } else if (learnedActions.length) {
      responseParts.push("Tambem encontrei acoes aprendidas em execucoes anteriores e vou reutilizar esse padrao.");
    }
  } else if (!isCommandLike) {
    responseParts.push("Com o contexto atual, consigo te orientar sem acionar ferramentas agora.");
  }

  if (agencyRef && !isCommandLike) {
    responseParts.push("Os agentes especializados locais reforcam a analise.");
  }

  if (inferMissionIntent(lower) && !isCommandLike) {
    responseParts.push("Vou tratar isso como uma missao em andamento, nao como uma resposta isolada.");
  }

  const quickGuidance = [];
  if (specialties.includes("marketing")) quickGuidance.push("olhar oferta, publico, mensagem, canal, metricao e conversao");
  if (specialties.includes("vendas")) quickGuidance.push("alinhar ICP, qualificacao, objecoes, follow-up e fechamento");
  if (specialties.includes("financas")) quickGuidance.push("separar caixa, receita, margem, risco e impacto economico");
  if (specialties.includes("gestao")) quickGuidance.push("priorizar proximo passo e reduzir dispersao");
  if (specialties.includes("assistente")) quickGuidance.push("manter contexto da sessao, executar o proximo passo e acompanhar pendencias");
  if (specialties.includes("tecnologia")) quickGuidance.push("mapear ferramentas, fluxo, integracoes, automacoes e pontos de falha");
  if (specialties.includes("infraestrutura")) {
    quickGuidance.push("mapear host, containers, servicos, logs, rede, volumes e permissoes antes de propor correcao");
  }
  if (specialties.includes("zabbix")) quickGuidance.push("validar host, template, item, trigger, discovery, fila e proxy antes de fechar diagnostico");
  if (specialties.includes("grafana")) quickGuidance.push("validar datasource, query, painel, time range, variaveis e alerting antes de concluir");

  const texto = [
    responseParts.join(" "),
    context?.agencyPlan && !isCommandLike ? `Plano inicial dos especialistas:\n${context.agencyPlan}` : "",
    quickGuidance.length && !isCommandLike ? `Minha leitura inicial e: ${quickGuidance.join("; ")}.` : "",
    relevantPlaybooks && !isCommandLike ? `Playbooks relevantes:\n${relevantPlaybooks}` : "",
    specialistNotes && !isCommandLike ? `Casos e padroes relevantes:\n${specialistNotes}` : "",
    memoriaPersistente && !isCommandLike ? `Memoria persistente do usuario:\n${memoriaPersistente}` : "",
    knowledgeSummary ? `Base local relevante:\n${knowledgeSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const payload = {
    texto: texto || "Entendi. Vou agir com base nisso.",
    fala:
      (isCommandLike
        ? `${baseAck} ${baseBridge}`
        : responseParts[0] || `${baseAck} ${baseBridge}` || "Entendi.")
        .replace(/\s+/g, " ")
        .trim(),
    acoes: actions,
  };

  return {
    content: JSON.stringify(payload),
    raw: JSON.stringify(payload),
    provider: "local",
    model: "heuristic-local-brain",
  };
}

export function shouldShortCircuitLocally(pergunta) {
  return isGreeting(pergunta) || isSmallTalk(pergunta) || isDateTimeQuery(pergunta) || (isDirectCommand(pergunta) && !isComplexCommand(pergunta));
}
