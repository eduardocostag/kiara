import { extractSearchTerms } from "./textSearch.js";

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function isGreeting(text) {
  const lower = String(text || "").toLowerCase().trim();
  return /^(oi|ola|olá|e ai|ei|hey|bom dia|boa tarde|boa noite|kiara)\b[!.? ]*$/.test(lower);
}

function isDirectCommand(text) {
  const lower = String(text || "").toLowerCase().trim();
  return /\b(abra|abrir|abre|acessa|pesquise|pesquisa|procure|busque)\b/.test(lower);
}

function detectUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : "";
}

function resolveNamedSite(text) {
  const lower = String(text || "").toLowerCase();
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

function inferKnowledgeType(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(prefiro|preferencia|sempre|nunca|gosto|nao gosto)\b/.test(lower)) return "preferencia";
  if (/\b(regra|padrao|sempre funciona|nao repetir|nao fazer)\b/.test(lower)) return "padrao";
  if (/\b(empresa|negocio|oferta|cliente|produto|servico|serviço)\b/.test(lower)) return "fato";
  return "nota";
}

function buildLearningAction(pergunta) {
  const text = String(pergunta || "").trim();
  const lower = text.toLowerCase();

  if (!/\b(lembra|lembre|guarde|anota|anote|prefiro|preferencia|sempre|nunca)\b/.test(lower)) {
    return null;
  }

  const tags = [];
  if (/\bprefiro|preferencia|sempre|nunca\b/.test(lower)) tags.push("preferencia");
  if (/\bmarketing|copy|seo|trafego\b/.test(lower)) tags.push("marketing");
  if (/\bvendas|proposta|lead|comercial\b/.test(lower)) tags.push("vendas");
  if (/\bfinanc|caixa|margem|orcamento\b/.test(lower)) tags.push("financas");
  if (/\bgestao|processo|operacao|prioridade\b/.test(lower)) tags.push("gestao");
  if (/\binfra|infraestrutura|linux|docker|container|servidor|nginx|systemd|compose\b/.test(lower)) tags.push("infraestrutura");

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
  if (terms.some((t) => ["vendas", "lead", "proposta", "oferta", "pitch", "fechamento"].includes(t))) found.push("vendas");
  if (terms.some((t) => ["financas", "financeiro", "caixa", "margem", "lucro", "receita"].includes(t))) found.push("financas");
  if (terms.some((t) => ["gestao", "processo", "operacao", "prioridade", "roadmap", "backlog"].includes(t))) found.push("gestao");
  if (terms.some((t) => ["tecnologia", "api", "automacao", "agente", "backend", "site"].includes(t))) found.push("tecnologia");
  if (terms.some((t) => ["infra", "infraestrutura", "linux", "docker", "container", "containers", "compose", "nginx", "systemd", "servidor"].includes(t))) {
    found.push("infraestrutura");
  }
  return unique(found);
}

function shouldDeepResearch(lower) {
  return /\b(a fundo|profundo|detalhado|detalhada|por baixo|investigue|investigacao|investigação)\b/.test(lower);
}

function shouldSearch(lower) {
  return /\b(pesquise|pesquisa|procure|busque|investigue|ache|descubra|levantamento)\b/.test(lower);
}

function inferMissionIntent(lower) {
  return /\b(quero|preciso|meta|objetivo|plano|projeto|missao|missão|organize|resolver|fazer)\b/.test(lower);
}

function directCommandResponse(pergunta) {
  const text = String(pergunta || "").trim();
  const lower = text.toLowerCase();
  const namedSite = resolveNamedSite(lower);

  if (namedSite && /\b(abra|abrir|abre|acessa|abrir o|abrir a)\b/.test(lower)) {
    return {
      texto: `Abrindo ${namedSite.url}.`,
      acoes: [{ tipo: "abrir_site", dados: { url: namedSite.url } }],
    };
  }

  if (/\b(abra|abrir|abre)\b/.test(lower) && /\bhttps?:\/\//.test(lower)) {
    const url = detectUrl(text);
    return {
      texto: `Abrindo ${url}.`,
      acoes: [{ tipo: "abrir_site", dados: { url } }],
    };
  }

  if (/\b(pesquise|pesquisa|procure|busque)\b/.test(lower) && !/\b(a fundo|profundo|detalhado|detalhada)\b/.test(lower)) {
    const cleanedQuery = text.replace(/\b(pesquise|pesquisa|procure|busque|investigue|ache|descubra)\b/gi, "").trim() || text;
    return {
      texto: `Abrindo uma busca por "${cleanedQuery}".`,
      acoes: [{ tipo: "pesquisa", dados: { query: cleanedQuery } }],
    };
  }

  return null;
}

function buildActionPlan(pergunta, { alocacaoUrl }) {
  const text = String(pergunta || "").trim();
  const lower = text.toLowerCase();
  const explicitUrl = detectUrl(text);
  const namedSite = resolveNamedSite(text);
  const url = explicitUrl || namedSite?.url || alocacaoUrl || "";
  const actions = [];

  if (/\b(abrir site|abra site|abrir o site|abre o site)\b/.test(lower) && url) {
    actions.push({ tipo: "abrir_site", dados: { url } });
  }

  if (/\b(youtube|video|vídeo)\b/.test(lower) && /\b(busca|pesquis|procura|ache)\b/.test(lower)) {
    actions.push({ tipo: "youtube_busca", dados: { query: text } });
  }

  if (shouldSearch(lower)) {
    const cleanedQuery = text.replace(/\b(pesquise|pesquisa|procure|busque|investigue|ache|descubra)\b/gi, "").trim() || text;
    actions.push({
      tipo: "pesquisar_web",
      dados: {
        query: cleanedQuery,
        profundo: shouldDeepResearch(lower),
        pageLimit: shouldDeepResearch(lower) ? 5 : 3,
      },
    });
  }

  if (url && /\b(auditoria|auditar|diagnostico|diagnóstico|seo|site)\b/.test(lower)) {
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
  const lowerContext = String(toolContext || "").toLowerCase();
  const lowerQuestion = String(pergunta || "").toLowerCase();

  if (!lowerContext.trim()) return null;
  if (/\bsem resultados\b|\bnenhuma\b|\bfalha\b|\burl invalida\b/.test(lowerContext)) {
    return {
      tipo: "pesquisar_web",
      dados: {
        query: pergunta,
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
        query: pergunta,
        profundo: true,
        pageLimit: 5,
      },
    };
  }

  return null;
}

export async function localChatCompletion({
  pergunta,
  conhecimento,
  memoria,
  conversaRecente,
  agencyRef,
  toolContext = "",
  context = {},
}) {
  if (isGreeting(pergunta)) {
    const payload = {
      texto: "Oi. Estou pronta. Posso conversar, pesquisar, abrir sites, automatizar tarefas e agir com mais profundidade quando voce pedir.",
      acoes: [],
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
  let actions = buildActionPlan(pergunta, context);
  const followUp = detectNeedFollowUp(toolContext, pergunta);
  if (followUp) actions = unique([...actions.map((a) => JSON.stringify(a)), JSON.stringify(followUp)]).map((item) => JSON.parse(item));

  const lower = String(pergunta || "").toLowerCase();
  const isCommandLike = /\b(abra|abrir|abre|pesquise|pesquisa|procure|busque|faça|faca|crie|automatize)\b/.test(lower);
  const responseParts = [];

  if (specialties.length) {
    responseParts.push(`Vou tratar isso com foco em ${specialties.join(", ")}.`);
  } else if (!isCommandLike) {
    responseParts.push("Vou organizar isso de forma pratica e objetiva.");
  }

  const knowledgeSummary = isGreeting(pergunta) ? "" : summarizeKnowledge(conhecimento);
  if (knowledgeSummary) {
    responseParts.push("Encontrei contexto local que ajuda na resposta.");
  } else if (!isCommandLike && String(memoria || conversaRecente || "").trim()) {
    responseParts.push("Tambem vou considerar o que ja apareceu na conversa e na memoria recente.");
  }

  if (toolContext) {
    responseParts.push("Revisei o resultado das acoes anteriores antes de decidir o proximo passo.");
  }

  if (actions.length) {
    responseParts.push("Ja montei um plano de acoes automaticas para avancar sem depender de improviso.");
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
  if (specialties.includes("marketing")) quickGuidance.push("olhar oferta, mensagem, canal e conversao");
  if (specialties.includes("vendas")) quickGuidance.push("alinhar ICP, objecoes e fechamento");
  if (specialties.includes("financas")) quickGuidance.push("separar caixa, margem e impacto economico");
  if (specialties.includes("gestao")) quickGuidance.push("priorizar proximo passo e reduzir dispersao");
  if (specialties.includes("tecnologia")) quickGuidance.push("mapear ferramentas, fluxo e automacoes");
  if (specialties.includes("infraestrutura")) {
    quickGuidance.push("mapear host, containers, servicos, logs, rede, volumes e permissoes antes de propor correcao");
  }

  const texto = [
    responseParts.join(" "),
    quickGuidance.length && !isCommandLike ? `Minha leitura inicial e: ${quickGuidance.join("; ")}.` : "",
    knowledgeSummary ? `Base local relevante:\n${knowledgeSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const payload = {
    texto: texto || "Entendi. Vou agir com base nisso.",
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
  return isGreeting(pergunta) || isDirectCommand(pergunta);
}
