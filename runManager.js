import path from "path";
import fs from "fs/promises";
import { extractJsonObject } from "./json.js";
import { chatCompletions } from "./llm.js";
import { localChatCompletion, shouldShortCircuitLocally, assessLocalRoute, isInstructionalQuery } from "./localBrain.js";
import { buildToolsPrompt, CLIENT_ACTIONS, executeServerAction, actionRequiresApproval } from "./tools.js";
import { loadAgencyContext } from "./agencyReference.js";
import { createWorkspaceStore } from "./workspaceStore.js";
import { createWorldStateStore } from "./worldStateStore.js";
import { createMissionStore } from "./missionStore.js";
import { createActionLearningStore } from "./actionLearningStore.js";
import { createSkillsStore } from "./skillsStore.js";
import { createAnswerLearningStore } from "./answerLearningStore.js";
import { pickSpeechText } from "./speechText.js";
import { hasScreenFrame, getScreenFrameSummary, getScreenAnalysisContext, formatScreenLiveSummary } from "./screenStore.js";

function getRuns() {
  if (!globalThis.__KIARA_RUNS) globalThis.__KIARA_RUNS = new Map();
  return globalThis.__KIARA_RUNS;
}

function shouldUseRemoteLlm() {
  return process.env.KIARA_REMOTE_LLM !== "0";
}

function getDebugLog() {
  if (!globalThis.__KIARA_DEBUG_LOG) globalThis.__KIARA_DEBUG_LOG = [];
  return globalThis.__KIARA_DEBUG_LOG;
}

function debugRun(event, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...payload,
  };
  const log = getDebugLog();
  log.push(entry);
  if (log.length > 300) log.shift();
  try {
    console.log("[KIARA_DEBUG]", JSON.stringify(entry));
  } catch {
    console.log("[KIARA_DEBUG]", event);
  }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uniqueGoals(items) {
  return [...new Set((items || []).filter(Boolean))].slice(0, 6);
}

function inferMissionTitle(question) {
  return String(question || "").trim().replace(/\s+/g, " ").slice(0, 120) || "Missao da KIARA";
}

function isExplicitExecutionRequest(question) {
  const lower = normalizeText(question);
  return /\b(execute|executar|rode|rodar|roda|teste|testar|verifique|verificar|confira|inspecione|olhe ai|olha ai|agora no sistema|no meu sistema|no ambiente|pra mim agora)\b/.test(lower);
}

function isConsultativeQuestion(question) {
  const lower = normalizeText(question);
  return /\b(qual comando|que comando|como|me ajuda|me ajude|me explica|me explique|explica|explique|o que e|o que significa|qual a diferenca|qual e a diferenca|para que serve)\b/.test(lower);
}

function looksMetaResponse(text) {
  const lower = normalizeText(text);
  return /\b(o usuario esta perguntando|como tenho um especialista|vou te devolver|vou organizar isso|vou tratar isso|ativei estes especialistas|ja vi o foco aqui)\b/.test(lower);
}

function adaptInstructionalResponse({ question, texto, fala, acoes }) {
  const actions = Array.isArray(acoes) ? acoes : [];
  const shellAction = actions.find((item) => item?.tipo === "executar_shell" && String(item?.dados?.cmd || "").trim());
  if (shellAction) {
    const cmd = String(shellAction.dados.cmd || "").trim();
    return {
      texto: `Comando sugerido:\n\`${cmd}\``,
      fala: "Coloquei o comando no texto.",
      acoes: [],
    };
  }

  if (looksMetaResponse(texto || "")) {
    return {
      texto: "Posso te responder diretamente em texto, sem executar nada. Reformule em uma frase curta se quiser que eu seja mais objetivo.",
      fala: "Posso te responder direto em texto.",
      acoes: [],
    };
  }

  return { texto, fala, acoes: [] };
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.:/-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldAutoInspectScreen(question) {
  const lower = normalizeText(question);
  return /\b(tela|screen|janela|erro|botao|onde clico|o que voce esta vendo|o que vc esta vendo|o que tem aqui|o que aparece|o que esta aparecendo|analisa isso|ve essa tela|olha isso)\b/.test(lower);
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m${rest}s` : `${minutes}m`;
}

function formatScreenContext(sessionId) {
  const summary = sessionId ? getScreenFrameSummary(sessionId) : null;
  if (!summary) return "";
  const analysis = getScreenAnalysisContext(sessionId, { limit: 2 });
  const liveSummary = formatScreenLiveSummary(sessionId);
  const header = `Ativa. Ultimo frame recebido ha ${formatDuration(summary.ageMs)} (${summary.w || "?"}x${summary.h || "?"}). Sessao visual ativa ha ${formatDuration(summary.activeForMs)} com ${summary.totalFrames} frames. Mudanca visual recente: ${summary.changedInRecentFrames ? "sim" : "nao"}.`;
  return [header, liveSummary ? `Resumo visual continuo:\n${liveSummary}` : "", analysis ? `Ultimas observacoes visuais:\n${analysis}` : ""].filter(Boolean).join("\n\n");
}

function profilePrompt(perfil) {
  const p = String(perfil || "").toLowerCase().trim();
  if (!p) return "";

  const map = {
    marketing: "Especialista em marketing (copy, funil, trafego, SEO, conteudo, CRM, analise de concorrencia).",
    gestao: "Especialista em gestao (processos, OKRs, priorizacao, operacao, lideranca, produtividade).",
    financas: "Especialista em financas (orcamento, fluxo de caixa, valuation, metricas, precificacao, risco).",
    engenharia: "Especialista em engenharia de software (frontend, review, seguranca, deploy, qualidade e operacao).",
    automacoes: "Especialista em automacoes (APIs, integracoes, scripts, RPA, no-code/low-code, tarefas recorrentes).",
    assistente: "Assistente operacional executiva (contexto continuo, pesquisa, navegador, acompanhamento, priorizacao e execucao assistida).",
    tecnologia: "Especialista em tecnologia (arquitetura, dev, seguranca, cloud, dados, boas praticas).",
    produto: "Especialista em produto (discovery, priorizacao, roadmap, definicao de escopo e criterio de valor).",
    estrategia: "Especialista em estrategia (mercado, posicionamento, foco, vantagem competitiva e decisoes de negocio).",
    suporte: "Especialista em suporte (triagem, atendimento, resolucao, FAQ, causas raiz e melhoria operacional).",
    testes: "Especialista em testes e QA (regressao, cenarios criticos, criterios de aceite e confiabilidade).",
    qa: "Especialista em testes e QA (regressao, cenarios criticos, criterios de aceite e confiabilidade).",
    infraestrutura: "Especialista em infraestrutura (Linux, Docker, redes, processos, logs, deploy, servidores, troubleshooting).",
    infra: "Especialista em infraestrutura (Linux, Docker, redes, processos, logs, deploy, servidores, troubleshooting).",
    linux: "Especialista em Linux (usuarios, permissoes, processos, servicos, logs, shell e administracao de servidores).",
    docker: "Especialista em Docker (containers, imagens, compose, redes, volumes, troubleshooting e deploy).",
    zabbix: "Especialista em Zabbix (hosts, templates, itens, triggers, discovery, proxies, tuning, troubleshooting, observabilidade e operacao).",
    grafana: "Especialista em Grafana (dashboards, datasources, queries, alerting, Loki, Prometheus, visualizacao e diagnostico).",
    "meta-ads": "Especialista em Meta Ads (estrutura de campanhas, publicos, criativos, mensuracao, CAPI, testes, otimizacao).",
    builder: "Especialista em construir aplicacoes (especificacao, arquitetura, backlog, UX minima, implementacao incremental).",
    professor: "Especialista em ensino (explica do zero ao avancado, com exemplos, exercicios e verificacao de entendimento).",
  };

  return map[p] ? `PERFIL: ${map[p]}` : `PERFIL: ${perfil}`;
}

function inferSpecialties(text) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  if (/\b(marketing|copy|seo|trafego|tráfego|meta ads|instagram|conteudo|conteúdo)\b/.test(lower)) found.push("marketing");
  if (/\b(vendas|lead|pipeline|proposta|oferta|fechamento|comercial)\b/.test(lower)) found.push("vendas");
  if (/\b(financas|financeiro|caixa|margem|receita|orcamento|orçamento)\b/.test(lower)) found.push("financas");
  if (/\b(gestao|gestão|processo|operacao|operação|roadmap|backlog|prioridade)\b/.test(lower)) found.push("gestao");
  if (/\b(engenharia|frontend|react|review|codigo|código|seguranca|security|devops|pipeline|deploy|qa|teste|testes)\b/.test(lower)) found.push("engenharia");
  if (/\b(produto|feature|discovery|mvp|usuario|usuário)\b/.test(lower)) found.push("produto");
  if (/\b(estrategia|estratégia|mercado|posicionamento|vantagem competitiva|modelo de negocio|modelo de negócio)\b/.test(lower)) found.push("estrategia");
  if (/\b(suporte|atendimento|ticket|cliente|faq|sla)\b/.test(lower)) found.push("suporte");
  if (/\b(testes|teste|qa|regressao|regressão|criterio de aceite|critério de aceite)\b/.test(lower)) found.push("testes");
  if (/\b(tecnologia|api|backend|frontend|arquitetura|codigo|código|site|automacao|automação)\b/.test(lower)) found.push("tecnologia");
  if (/\b(infra|infraestrutura|linux|docker|container|compose|nginx|systemd|servidor)\b/.test(lower)) found.push("infraestrutura");
  if (/\b(zabbix|zbx|trigger|template|host group|hostgroup|discovery rule|lld|item key)\b/.test(lower)) found.push("zabbix");
  if (/\b(grafana|dashboard|datasource|data source|loki|prometheus|promql|alert rule|alerting|panel query)\b/.test(lower)) found.push("grafana");
  if (/\b(roas|roi|cac|ltv|cpl)\b/.test(lower)) found.push("marketing");
  if (/\b(follow-up|followup|qualificacao|qualificacao|crm|outbound|inbound)\b/.test(lower)) found.push("vendas");
  if (/\b(precificacao|precificacao|inadimplencia|dre|fluxo de caixa)\b/.test(lower)) found.push("financas");
  if (/\b(workflow|integracao|integracao|webhook)\b/.test(lower)) found.push("tecnologia");
  return [...new Set(found)];
}

function ensureInfraSpecialization(expertise = {}) {
  const next = { ...(expertise || {}) };
  const baseline = {
    infraestrutura: 12,
    linux: 12,
    docker: 12,
    zabbix: 12,
    grafana: 12,
    tecnologia: 8,
  };
  for (const [key, value] of Object.entries(baseline)) {
    next[key] = Math.max(Number(next[key] || 0), value);
  }
  return next;
}

function buildInfraSpecialistProtocol(expertise = {}) {
  const domains = Object.entries(expertise || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([name]) => name);
  const isInfraStack = ["infraestrutura", "linux", "docker", "zabbix", "grafana"].some((name) => domains.includes(name));
  if (!isInfraStack) return "";
  return [
    "PROTOCOLO SENIOR DE INFRAESTRUTURA:",
    "- Em Zabbix: pensar em host, template, item, trigger, discovery, proxy, queue, cache, pollers, history, trends e permissoes.",
    "- Em Grafana: pensar em datasource, query, painel, variaveis, alerting, thresholds, time range e origem do dado.",
    "- Em Linux: pensar em processo, servico, systemd, logs, permissoes, usuario, rede, disco, CPU, memoria e kernel.",
    "- Em Docker: pensar em container, image, compose, network, volume, mount, healthcheck, logs e restart policy.",
    "- Em diagnostico: seguir ordem sintomas -> escopo -> evidencia -> comando de verificacao -> causa provavel -> correcao -> validacao.",
    "- Em respostas tecnicas: sempre que possivel, dar comando objetivo, explicar o que ele verifica e diferenciar host, servico e container.",
  ].join("\n");
}

function detectInfraScenario(question) {
  const lower = normalizeText(question);
  if (/\b(zabbix|item unsupported|unsupported item|unsupported)\b/.test(lower)) {
    return { key: "zabbix-item-unsupported", label: "Zabbix item unsupported", terms: ["zabbix", "item", "unsupported"] };
  }
  if (/\b(zabbix|fila|queue|atraso de coleta|poller)\b/.test(lower) && /\b(fila|queue|poller|coleta)\b/.test(lower)) {
    return { key: "zabbix-fila-alta", label: "Zabbix fila alta", terms: ["zabbix", "fila", "queue", "poller"] };
  }
  if (/\b(grafana|datasource|data source|loki|prometheus|promql)\b/.test(lower) && /\b(datasource|data source|erro|nao conecta|não conecta|sem dado|painel vazio)\b/.test(lower)) {
    return { key: "grafana-datasource-falha", label: "Grafana datasource falha", terms: ["grafana", "datasource", "loki", "prometheus"] };
  }
  if (/\b(docker|container|compose)\b/.test(lower) && /\b(restart loop|reiniciando|restartando|restart|caindo)\b/.test(lower)) {
    return { key: "docker-restart-loop", label: "Docker restart loop", terms: ["docker", "container", "restart"] };
  }
  if (/\b(systemd|servico|serviço|unit)\b/.test(lower) && /\b(falha|failed|nao sobe|não sobe|inactive|dead|restartando)\b/.test(lower)) {
    return { key: "linux-systemd-servico-falha", label: "Linux systemd servico falha", terms: ["linux", "systemd", "servico"] };
  }
  return null;
}

function prioritizePlaybooks(automations = [], scenario = null) {
  const items = Array.isArray(automations) ? [...automations] : [];
  if (!scenario?.key) return items;
  return items.sort((a, b) => {
    const aHit = String(a.slug || "").includes(scenario.key) || String(a.nome || "").toLowerCase().includes(String(scenario.label || "").toLowerCase());
    const bHit = String(b.slug || "").includes(scenario.key) || String(b.nome || "").toLowerCase().includes(String(scenario.label || "").toLowerCase());
    if (aHit === bHit) return 0;
    return aHit ? -1 : 1;
  });
}

function formatWorkspaceExpertise(expertise) {
  const entries = Object.entries(expertise || {}).filter(([, value]) => Number(value) > 0);
  if (!entries.length) return "";
  return entries
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4)
    .map(([name, value]) => `${name}(${value})`)
    .join(", ");
}

function getTopExpertiseAreas(expertise, limit = 3) {
  return Object.entries(expertise || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([name]) => name);
}

function formatPlaybooks(automations) {
  const items = Array.isArray(automations) ? automations : [];
  if (!items.length) return "";
  return items
    .slice(0, 4)
    .map((item, index) => {
      const sourceLabel = item.source === "workspace" ? "workspace" : "base";
      const steps = Array.isArray(item.passos) && item.passos.length
        ? `\n   Passos:\n   - ${item.passos.slice(0, 4).join("\n   - ")}`
        : "";
      return `${index + 1}. ${item.nome || item.slug || "Automacao"}\n   Origem: ${sourceLabel}\n   Objetivo: ${item.objetivo || "(nao definido)"}${item.url ? `\n   URL: ${item.url}` : ""}${steps}`;
    })
    .join("\n\n");
}

function formatSpecialistNotes(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return clean.split("\n").slice(0, 24).join("\n");
}

async function refreshWorkspaceIntelligence({ state, knowledgeStore }) {
  const topAreas = getTopExpertiseAreas(state.wsCfg?.especialidades, 3);
  state.dominantSpecialties = topAreas;
  state.workspaceExpertiseSummary = formatWorkspaceExpertise(state.wsCfg?.especialidades);
  const [notes, automations, learnedActionSummary, learnedActionPatterns, learnedActionSequences, learnedSkillSummary, relevantSkills, learnedAnswerSummary, learnedAnswers] = await Promise.all([
    knowledgeStore?.getTopNotesByTags
      ? knowledgeStore.getTopNotesByTags(state.workspaceId, [...topAreas, "caso-sucesso"], { limit: 5 })
      : "",
    state.workspaces?.getRelevantAutomations
      ? state.workspaces.getRelevantAutomations(state.workspaceId, state.pergunta, { limit: 4 })
      : [],
    state.actionLearningStore?.summarizeRelevant
      ? state.actionLearningStore.summarizeRelevant(state.workspaceId, state.pergunta, { limit: 4 })
      : "",
    state.actionLearningStore?.findRelevant
      ? state.actionLearningStore.findRelevant(state.workspaceId, state.pergunta, { limit: 5, minScore: 2 })
      : [],
    state.actionLearningStore?.findRelevantSequences
      ? state.actionLearningStore.findRelevantSequences(state.workspaceId, state.pergunta, { limit: 3, minScore: 3 })
      : [],
    state.skillsStore?.summarizeRelevant
      ? state.skillsStore.summarizeRelevant(state.workspaceId, state.pergunta, { limit: 4 })
      : "",
    state.skillsStore?.findRelevant
      ? state.skillsStore.findRelevant(state.workspaceId, state.pergunta, { limit: 4, minScore: 2 })
      : [],
    state.answerLearningStore?.summarizeRelevant
      ? state.answerLearningStore.summarizeRelevant(state.workspaceId, state.pergunta, { limit: 4 })
      : "",
    state.answerLearningStore?.findRelevant
      ? state.answerLearningStore.findRelevant(state.workspaceId, state.pergunta, { limit: 4, minScore: 2 })
      : [],
  ]);
  state.specialistNotes = formatSpecialistNotes(notes);
  state.relevantPlaybooks = formatPlaybooks(automations);
  state.learnedActionSummary = learnedActionSummary || "";
  state.learnedActionPatterns = Array.isArray(learnedActionPatterns) ? learnedActionPatterns : [];
  state.learnedActionSequences = Array.isArray(learnedActionSequences) ? learnedActionSequences : [];
  state.learnedSkillSummary = learnedSkillSummary || "";
  state.relevantSkills = Array.isArray(relevantSkills) ? relevantSkills : [];
  state.learnedAnswerSummary = learnedAnswerSummary || "";
  state.learnedAnswers = Array.isArray(learnedAnswers) ? learnedAnswers : [];
  state.infraProtocol = buildInfraSpecialistProtocol(state.wsCfg?.especialidades);
}

async function updateWorkspaceExpertise({ workspaces, workspaceId, wsCfg, pergunta, results }) {
  if (!workspaces || !workspaceId) return wsCfg || null;

  const current = { ...(wsCfg || {}) };
  const expertise = { ...(current.especialidades || {}) };
  const signals = inferSpecialties(pergunta);

  for (const result of results || []) {
    if (!result?.ok) continue;
    signals.push(...inferSpecialties(`${result.tipo}\n${result.result || ""}`));
  }

  for (const name of [...new Set(signals)]) {
    expertise[name] = Math.min(Number(expertise[name] || 0) + 1, 50);
  }

  const next = await workspaces.setWorkspace(workspaceId, { especialidades: expertise });
  return next;
}

function formatWorldState(worldState) {
  if (!worldState || typeof worldState !== "object") return "";
  const goals = Array.isArray(worldState.activeGoals) && worldState.activeGoals.length ? `Metas ativas: ${worldState.activeGoals.join(" | ")}` : "";
  const loops = Array.isArray(worldState.openLoops) && worldState.openLoops.length ? `Loops abertos: ${worldState.openLoops.join(" | ")}` : "";
  const actions = Array.isArray(worldState.recentActions) && worldState.recentActions.length
    ? `Acoes recentes:\n- ${worldState.recentActions.map((item) => item.summary || item.tipo || JSON.stringify(item)).join("\n- ")}`
    : "";
  const findings = Array.isArray(worldState.recentFindings) && worldState.recentFindings.length
    ? `Achados recentes:\n- ${worldState.recentFindings.map((item) => item.summary || JSON.stringify(item)).join("\n- ")}`
    : "";

  return [
    worldState.currentFocus ? `Foco atual: ${worldState.currentFocus}` : "",
    worldState.status ? `Status: ${worldState.status}` : "",
    goals,
    loops,
    actions,
    findings,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSystemPrompt({
  memoria,
  memoriaPersistente,
  conversaRecente,
  conhecimento,
  specialistNotes,
  relevantPlaybooks,
  learnedActionSummary,
  learnedSkillSummary,
  learnedAnswerSummary,
  screenContext,
  worldState,
  missions,
  workspaceExpertise,
  infraProtocol,
  perfil,
  agencyRoster,
  agencyPlan,
  agencyRef,
  brainContent,
  providerName,
}) {
  return `
Voce e KIARA.
Uma IA autonoma projetada para agir com contexto, iniciativa e conversa natural.

Seu "Cerebro" (kiara_brain.md) e sua lei absoluta. Antes de cada resposta, consulte suas diretrizes.
Prioridade tecnica atual: operar de forma local-first, reaproveitando conhecimento local sempre que possivel.
Provider atual: ${providerName || "desconhecido"}.

${profilePrompt(perfil)}

ESTILO DE CONVERSA:
- Converse de forma fluida, natural e inteligente.
- Mantenha continuidade com o que acabou de ser dito, sem parecer robotica.
- Se souber algo pelo conhecimento local, pelo estado do mundo do workspace, pelas missoes abertas ou pela memoria recente, reutilize antes de depender de busca externa.
- Reaproveite playbooks, automacoes e casos de sucesso do workspace sempre que forem relevantes.
- Reaproveite acoes aprendidas com sucesso quando o pedido atual parecer semelhante a execucoes anteriores.
- Se houver playbook claramente aderente ao pedido, use-o como estrutura inicial de execucao e adaptacao.
- Quando fizer pesquisa ou automacao, explique em linguagem humana o que encontrou e o que ainda falta validar.
- Em pedidos amplos, aja como assistente executiva: entenda objetivo, decomponha, execute o proximo passo de maior valor e mantenha o fio da sessao.
- Quando responder para voz, prefira frases curtas, naturais e sem narrar protocolo interno.
- Se o usuario estiver pedindo explicacao, comando, exemplo, orientacao, comparacao, diagnostico conceitual ou "como fazer", responda primeiro em texto de forma direta.
- Nesses casos, nao use ferramenta so para "descobrir" um comando ou montar uma resposta teorica, a menos que o usuario peca explicitamente para executar, testar, inspecionar o ambiente atual ou validar no sistema real.
- Nunca use "executar_shell" como substituto de resposta explicativa.

PROTOCOLOS PRIORITARIOS:
- Em marketing, pensar em oferta, publico, mensagem, canal, captura, conversao e mensuracao.
- Em vendas, pensar em ICP, origem do lead, qualificacao, objecoes, follow-up e fechamento.
- Em financas, separar caixa, receita, margem, lucro, recorrencia, inadimplencia e risco de curto prazo.
- Em automacoes, mapear gatilho, entrada, validacao, decisao, saida, log e fallback.
- Se um pedido cruzar marketing, vendas, financas e automacoes, organizar como um sistema unico de receita e operacao.

POLITICA DE SEGURANCA:
- Para acoes arriscadas (browser_run, escrever_arquivo, executar_shell e qualquer acao de desktop local), sempre peca aprovacao antes de executar.
- Para automacao em sites, prefira "pesquisar_web" + "navegar". Use "browser_run" quando precisar clicar, preencher ou iterar em paginas.
- So use "salvar_nota" se o usuario pedir para lembrar, ou se for um aprendizado generico util para o futuro.
- Se a pergunta exigir "buscar a fundo", use "pesquisar_web" com { "profundo": true }.
- Se existir um "site alocado" e o usuario pedir diagnostico/marketing/SEO, use "site_audit" antes de propor o plano quando fizer sentido.
- Se o usuario pedir criar uma automacao ou agente, proponha um playbook e use "criar_automacao" quando houver valor.
- Se descobrir padrao de sucesso, regra de negocio importante ou preferencia persistente do usuario, use "salvar_nota" para aprender localmente.
- Em infraestrutura, Linux e Docker, siga uma ordem de raciocinio: sintomas, ambiente, servicos, logs, rede, volumes, permissoes, consumo de recursos e rollback.

CONHECIMENTO SALVO:
${conhecimento || "(vazio)"}

CASOS E PADROES RELEVANTES DO WORKSPACE:
${specialistNotes || "(nenhum caso relevante encontrado)"}

CONVERSA RECENTE:
${conversaRecente || "(vazia)"}

MEMORIA RELACIONADA:
${memoria || "(vazia)"}

MEMORIA PERSISTENTE DO USUARIO:
${memoriaPersistente || "(vazia)"}

ESTADO DO MUNDO DO WORKSPACE:
${worldState || "(vazio)"}

MISSOES ABERTAS:
${missions || "(nenhuma)"}

ESPECIALIZACAO ACUMULADA DO WORKSPACE:
${workspaceExpertise || "(ainda em formacao)"}

PROTOCOLO TECNICO DOMINANTE:
${infraProtocol || "(nenhum protocolo tecnico dominante ativo)"}

PLAYBOOKS E AUTOMACOES REUTILIZAVEIS:
${relevantPlaybooks || "(nenhum playbook relevante ainda)"}

ACOES APRENDIDAS COM SUCESSO:
${learnedActionSummary || "(nenhuma acao aprendida relevante ainda)"}

SKILLS LOCAIS REUTILIZAVEIS:
${learnedSkillSummary || "(nenhuma skill local relevante ainda)"}

RESPOSTAS APRENDIDAS:
${learnedAnswerSummary || "(nenhuma resposta aprendida relevante ainda)"}

TELA COMPARTILHADA:
${screenContext || "(nenhuma tela ativa)"}

ESPECIALISTAS ATIVOS:
${agencyRoster || "(nenhum especialista adicional ativado)"}

PLANO DOS ESPECIALISTAS:
${agencyPlan || "(nenhum plano adicional)"}

NUCLEO DE IDENTIDADE (kiara_brain.md):
${brainContent || "(vazio)"}

${agencyRef ? `\nREFERENCIA (agency-agents):\n${agencyRef}\n` : ""}

${buildToolsPrompt()}

FORMATO DE RESPOSTA:
- Sempre devolva "texto" e "fala".
- "texto": pode ser mais completo, util para contexto, memoria e continuidade.
- "fala": obrigatoria, curta, oral, natural e pronta para ser falada em voz alta.
- Quando o usuario fizer uma pergunta objetiva, "texto" deve conter a resposta em si, e nao metacomentario como "vou organizar isso" ou "vou te devolver isso de forma direta".
- Se houver comando util para responder, escreva o comando em "texto". So coloque acao se o usuario pediu execucao real.
- Em "fala", evite listar processo interno, evitar jargao tecnico desnecessario, evitar repetir a pergunta, evitar URLs e evitar tom de relatorio.
- Em "fala", prefira 1 a 3 frases curtas. So alongue se isso for realmente necessario.
- Se a tarefa envolver uma acao imediata, a "fala" deve soar presente e direta. Exemplo: "Certo. Vou abrir isso agora." ou "Ja estou olhando. Te resumo o que importar."
- Quando houver playbook reutilizavel ou especializacao forte do workspace, incorpore isso no plano e aja como quem ja aprendeu com casos anteriores.
- Se houver tela compartilhada ativa e a pergunta depender do que esta na tela, use "ver_tela" mesmo sem o usuario pedir a ferramenta explicitamente.
- Em cumprimentos e conversa social curta, responda de forma minima e calorosa. Exemplos:
  - Usuario: "oi" -> fala: "Oi. Pode falar."
  - Usuario: "tudo bem?" -> fala: "Tudo certo. Pode falar."
  - Usuario: "obrigado" -> fala: "Claro."
  - Usuario: "quem e voce?" -> fala: "Sou a Kiara."
- Nao transforme saudacao em mini apresentacao. Nao explique capacidades se o usuario so iniciou a conversa.
`.trim();
}

function normalizeActions(acoes) {
  if (!Array.isArray(acoes)) return [];
  return acoes
    .map((a) => ({ tipo: a?.tipo, dados: a?.dados ?? {} }))
    .filter((a) => typeof a.tipo === "string" && a.tipo.length);
}

function splitActions(acoes) {
  const client = [];
  const server = [];
  for (const a of acoes) {
    if (CLIENT_ACTIONS.has(a.tipo)) client.push(a);
    else server.push(a);
  }
  return { client, server };
}

function actionLabel(a) {
  if (!a?.tipo) return "(acao)";
  if (a.tipo === "browser_run") return `Automatizar site: ${a?.dados?.url || ""}`.trim();
  if (a.tipo === "desktop_abrir_links") return `Abrir varios links em paralelo`.trim();
  if (a.tipo === "desktop_abrir_app") return `Abrir aplicativo: ${a?.dados?.app || ""}`.trim();
  if (a.tipo === "desktop_abrir_multiplos") return `Abrir varios navegadores/sites em paralelo`.trim();
  if (a.tipo === "desktop_abrir_janelas_browser") return `Abrir varias janelas no navegador: ${a?.dados?.app || ""}`.trim();
  if (a.tipo === "desktop_abrir_caminho") return `Abrir caminho local: ${a?.dados?.path || ""}`.trim();
  if (a.tipo === "desktop_copiar_texto") return `Copiar texto para a area de transferencia`.trim();
  if (a.tipo === "desktop_enviar_teclas") return `Enviar teclas para a janela ativa: ${a?.dados?.keys || ""}`.trim();
  if (a.tipo === "executar_shell") return `Executar comando: ${a?.dados?.cmd || ""}`.trim();
  if (a.tipo === "escrever_arquivo") return `Escrever arquivo: ${a?.dados?.path || ""}`.trim();
  if (a.tipo === "ver_tela") return `Analisar tela: ${a?.dados?.pergunta || ""}`.trim();
  if (a.tipo === "navegar") return `Navegar URL: ${a?.dados?.url || ""}`.trim();
  if (a.tipo === "pesquisar_web") return `Pesquisar web: ${a?.dados?.query || ""}`.trim();
  return a.tipo;
}

function formatActionResults(results) {
  return results.map((r) => `ACAO: ${r.tipo}\nOK: ${r.ok}\nRESULTADO:\n${r.result}`).join("\n\n");
}

function appendToolContext(current, results) {
  if (!Array.isArray(results) || !results.length) return current || "";
  return [current, formatActionResults(results)].filter(Boolean).join("\n\n");
}

async function persistSupervisorLearning({ knowledgeStore, workspaceId, pergunta, results }) {
  if (!knowledgeStore || !Array.isArray(results) || !results.length) return;

  const successful = results.filter((result) => result?.ok);
  if (!successful.length) return;

  const relevant = successful
    .filter((result) => ["pesquisar_web", "site_audit", "buscar_leads", "criar_automacao", "browser_run"].includes(result.tipo))
    .slice(0, 2);

  for (const item of relevant) {
    const snippet = String(item.result || "").slice(0, 800);
    await knowledgeStore.addNote(workspaceId, {
      titulo: `Padrao operacional: ${item.tipo}`,
      conteudo: `Pergunta original: ${pergunta}\n\nAcao util executada: ${item.tipo}\n\nResultado resumido:\n${snippet}`,
      tags: ["padrao", item.tipo],
      tipoConhecimento: "padrao",
    });
  }

  const specialties = inferSpecialties(`${pergunta}\n${successful.map((item) => `${item.tipo}\n${item.result || ""}`).join("\n")}`);
  if (specialties.length && successful.length) {
    await knowledgeStore.addNote(workspaceId, {
      titulo: `Caso de sucesso em ${specialties[0]}`,
      conteudo: [
        `Pergunta: ${pergunta}`,
        "",
        "Acoes que deram certo:",
        ...successful.slice(0, 3).map((item) => `- ${item.tipo}: ${String(item.result || "").slice(0, 280)}`),
      ].join("\n"),
      tags: [...specialties.slice(0, 3), "caso-sucesso"],
      tipoConhecimento: "padrao",
    });
  }
}

async function persistActionLearning({ actionLearningStore, workspaceId, pergunta, results }) {
  if (!actionLearningStore?.learnFromExecution) return;
  if (!Array.isArray(results) || !results.length) return;
  await actionLearningStore.learnFromExecution(workspaceId, pergunta, results);
}

async function persistSkillsLearning({ skillsStore, workspaceId, pergunta, results }) {
  if (!skillsStore?.learnFromExecution) return;
  if (!Array.isArray(results) || !results.length) return;
  await skillsStore.learnFromExecution(workspaceId, pergunta, results);
}

async function persistAnswerLearning({ answerLearningStore, workspaceId, pergunta, texto, acoes }) {
  if (!answerLearningStore?.learnFromAnswer) return;
  if (Array.isArray(acoes) && acoes.length) return;
  const answer = String(texto || "").trim();
  if (!answer) return;
  await answerLearningStore.learnFromAnswer(workspaceId, pergunta, answer);
}

async function armPendingAnswerFeedback({ answerLearningStore, workspaceId, pergunta, texto, acoes }) {
  if (!answerLearningStore?.setPendingFeedback) return;
  if (Array.isArray(acoes) && acoes.length) return;
  const answer = String(texto || "").trim();
  if (!answer) return;
  await answerLearningStore.setPendingFeedback(workspaceId, {
    question: pergunta,
    answer,
  });
}

async function updateWorldStateFromResults({ worldStateStore, workspaceId, pergunta, results }) {
  if (!worldStateStore || !Array.isArray(results) || !results.length) return;

  await worldStateStore.set(workspaceId, {
    status: "working",
    currentFocus: pergunta,
    activeGoals: uniqueGoals([pergunta]),
  });

  for (const result of results) {
    await worldStateStore.pushAction(workspaceId, {
      tipo: result.tipo,
      ok: result.ok,
      summary: `${result.tipo}: ${result.ok ? "ok" : "falha"}`,
      time: Date.now(),
    });

    if (result.ok) {
      await worldStateStore.pushFinding(workspaceId, {
        tipo: result.tipo,
        summary: String(result.result || "").slice(0, 240),
        time: Date.now(),
      });
    }
  }
}

async function updateMissionStore({ missionStore, workspaceId, question, text, results, pendingLabels = [] }) {
  if (!missionStore) return;
  const title = inferMissionTitle(question);
  const summary = String(text || "").slice(0, 260);
  const nextStep = pendingLabels.length
    ? `Aguardar/aprovar: ${pendingLabels.join(" | ")}`
    : Array.isArray(results) && results.some((item) => item?.ok)
      ? "Revisar resultado e definir proximo passo"
      : "Esclarecer ou tentar nova estrategia";

  await missionStore.upsert(workspaceId, {
    id: title,
    title,
    status: pendingLabels.length ? "blocked" : "open",
    nextStep,
    summary,
  });
}

export async function startRun({
  pergunta,
  perfil,
  autonoma,
  alocacaoUrl,
  workspaceId,
  sessionId,
  memoryStore,
  knowledgeStore,
  baseDir,
  llmConfig,
}) {
  debugRun("startRun.begin", {
    perguntaPreview: String(pergunta || "").slice(0, 140),
    perfil: perfil || null,
    autonoma: Boolean(autonoma),
    workspaceId: workspaceId || null,
    sessionId: sessionId || null,
  });
  const safeBaseDir = baseDir || path.resolve(".");
  const workspaces = createWorkspaceStore({ baseDir: safeBaseDir });
  const worldStateStore = createWorldStateStore({ baseDir: safeBaseDir });
  const missionStore = createMissionStore({ baseDir: safeBaseDir });
  const actionLearningStore = createActionLearningStore({ baseDir: safeBaseDir });
  const skillsStore = createSkillsStore({ baseDir: safeBaseDir });
  const answerLearningStore = createAnswerLearningStore({ baseDir: safeBaseDir });
  const wid = workspaces.sanitizeWorkspaceId(workspaceId || sessionId || "default");
  await answerLearningStore.registerUserFollowUp(wid, pergunta);
  let wsCfg = await workspaces.getWorkspace(wid);
  const seededExpertise = ensureInfraSpecialization(wsCfg?.especialidades);
  if (JSON.stringify(seededExpertise) !== JSON.stringify(wsCfg?.especialidades || {})) {
    wsCfg = await workspaces.setWorkspace(wid, { especialidades: seededExpertise });
  }

  const effectiveAllocUrl = alocacaoUrl ? String(alocacaoUrl) : wsCfg.alocacaoUrl;
  if (alocacaoUrl) {
    await workspaces.setWorkspace(wid, { alocacaoUrl: String(alocacaoUrl) });
  }

  const memoria = memoryStore ? await memoryStore.getRelevant(wid, pergunta) : "";
  const memoriaPersistente = memoryStore?.getProfile ? await memoryStore.getProfile(wid, { limit: 10 }) : "";
  const conversaRecente = memoryStore?.getRecent ? await memoryStore.getRecent(wid, { limit: 8 }) : "";
  const conhecimento = knowledgeStore ? await knowledgeStore.search(wid, pergunta) : "";
  const topExpertiseAreas = getTopExpertiseAreas(wsCfg?.especialidades, 3);
  const [specialistNotes, relevantAutomations] = await Promise.all([
    knowledgeStore?.getTopNotesByTags ? knowledgeStore.getTopNotesByTags(wid, [...topExpertiseAreas, "caso-sucesso"], { limit: 5 }) : "",
    workspaces.getRelevantAutomations(wid, pergunta, { limit: 4 }),
  ]);
  const worldState = await worldStateStore.get(wid);
  const missionsData = await missionStore.list(wid);
  const agencyContext = await loadAgencyContext({ baseDir: safeBaseDir, perfil, pergunta });

  let brainContent = "";
  try {
    const brainPath = path.join(safeBaseDir, "kiara_brain.md");
    brainContent = await fs.readFile(brainPath, "utf8");
  } catch {
    brainContent = "";
  }

  const runId = newId();
  const state = {
    runId,
    pergunta: String(pergunta),
    perfil,
    autonoma: Boolean(autonoma),
    workspaceId: wid,
    workspaces,
    wsCfg,
    workspaceExpertiseSummary: formatWorkspaceExpertise(wsCfg?.especialidades),
    dominantSpecialties: topExpertiseAreas,
    specialistNotes: formatSpecialistNotes(specialistNotes),
    relevantPlaybooks: formatPlaybooks(relevantAutomations),
    learnedActionSummary: "",
    learnedActionPatterns: [],
    learnedActionSequences: [],
    learnedSkillSummary: "",
    relevantSkills: [],
    learnedAnswerSummary: "",
    learnedAnswers: [],
    infraProtocol: buildInfraSpecialistProtocol(wsCfg?.especialidades),
    screenContext: formatScreenContext(sessionId),
    alocacaoUrl: effectiveAllocUrl ? String(effectiveAllocUrl) : null,
    sessionId: sessionId ? String(sessionId) : null,
    llmConfig: { ...(llmConfig || {}), model: llmConfig?.model || "mistral-small-latest" },
    temperature: 0.45,
    maxSteps: Boolean(autonoma) ? 5 : 2,
    step: 0,
    memoria,
    memoriaPersistente,
    conversaRecente,
    conhecimento,
    worldState,
    missionsData,
    agencyRoster: agencyContext.rosterSummary,
    agencyPlan: agencyContext.formattedPlan,
    agencyRef: agencyContext.referenceText,
    brainContent,
    toolContext: "",
    lastText: "",
    lastSpeech: "",
    clientActions: [],
    pending: [],
    baseDir: safeBaseDir,
    worldStateStore,
    missionStore,
    actionLearningStore,
    skillsStore,
    answerLearningStore,
    createdAt: Date.now(),
  };

  await refreshWorkspaceIntelligence({ state, knowledgeStore });

  getRuns().set(runId, state);
  debugRun("startRun.created", {
    runId,
    workspaceId: wid,
    perfil: perfil || null,
    maxSteps: state.maxSteps,
  });
  await state.worldStateStore.set(state.workspaceId, {
    status: "working",
    currentFocus: state.pergunta,
    activeGoals: uniqueGoals([state.pergunta, ...(state.worldState?.activeGoals || [])]),
  });
  await state.missionStore.upsert(state.workspaceId, {
    id: inferMissionTitle(state.pergunta),
    title: inferMissionTitle(state.pergunta),
    status: "open",
    nextStep: "Executar primeira rodada de analise/acoes",
    summary: state.pergunta,
  });
  state.worldState = await state.worldStateStore.get(state.workspaceId);
  state.missionsData = await state.missionStore.list(state.workspaceId);
  return continueRun({ runId, approvals: {}, memoryStore, knowledgeStore });
}

export async function continueRun({ runId, approvals, memoryStore, knowledgeStore }) {
  const state = getRuns().get(String(runId));
  if (!state) {
    debugRun("continueRun.missing", { runId });
    return { ok: false, error: "Run nao encontrado (expirou ou reiniciou servidor)" };
  }

  debugRun("continueRun.begin", {
    runId: state.runId,
    step: state.step,
    pendingCount: Array.isArray(state.pending) ? state.pending.length : 0,
    approvalKeys: approvals && typeof approvals === "object" ? Object.keys(approvals) : [],
  });

  if (Array.isArray(state.pending) && state.pending.length) {
    const results = [];
    for (const p of state.pending) {
      const decision = approvals?.[p.id];
      if (decision !== true) {
        results.push({
          tipo: p.action.tipo,
          ok: false,
          result: `ACAO REJEITADA PELO USUARIO: ${actionLabel(p.action)}`,
        });
        continue;
      }

      try {
        const r = await executeServerAction({
          action: p.action,
          baseDir: state.baseDir,
          knowledgeStore,
          context: {
            sessionId: state.sessionId,
            workspaceId: state.workspaceId,
            alocacaoUrl: state.alocacaoUrl,
          },
        });
        results.push({ tipo: p.action.tipo, ok: r.ok, result: r.result, action: p.action });
      } catch (err) {
        results.push({ tipo: p.action.tipo, ok: false, result: err?.message || String(err), action: p.action });
      }
    }

    state.pending = [];
    state.toolContext = appendToolContext(state.toolContext, results);
    debugRun("continueRun.pending.executed", {
      runId: state.runId,
      results: results.map((item) => ({ tipo: item.tipo, ok: item.ok })),
    });
    await updateWorldStateFromResults({
      worldStateStore: state.worldStateStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results,
    });
    await persistSupervisorLearning({
      knowledgeStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results,
    });
    await persistActionLearning({
      actionLearningStore: state.actionLearningStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results,
    });
    await persistSkillsLearning({
      skillsStore: state.skillsStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results,
    });
    await updateMissionStore({
      missionStore: state.missionStore,
      workspaceId: state.workspaceId,
      question: state.pergunta,
      text: state.lastText,
      results,
    });
    state.wsCfg = await updateWorkspaceExpertise({
      workspaces: state.workspaces,
      workspaceId: state.workspaceId,
      wsCfg: state.wsCfg,
      pergunta: state.pergunta,
      results,
    });
    await refreshWorkspaceIntelligence({ state, knowledgeStore });
    state.worldState = await state.worldStateStore.get(state.workspaceId);
    state.missionsData = await state.missionStore.list(state.workspaceId);
  }

  for (; state.step < state.maxSteps; state.step++) {
    const liveScreen = state.sessionId ? getScreenFrameSummary(state.sessionId) : null;
    state.screenContext = formatScreenContext(state.sessionId);

    if (
      liveScreen &&
      shouldAutoInspectScreen(state.pergunta) &&
      !/\bACAO:\s*ver_tela\b/i.test(String(state.toolContext || ""))
    ) {
      try {
        const visionResult = await executeServerAction({
          action: { tipo: "ver_tela", dados: { pergunta: state.pergunta } },
          baseDir: state.baseDir,
          knowledgeStore,
          context: {
            sessionId: state.sessionId,
            workspaceId: state.workspaceId,
            alocacaoUrl: state.alocacaoUrl,
          },
        });
        state.toolContext = appendToolContext(state.toolContext, [{
          tipo: "ver_tela",
          ok: visionResult.ok,
          result: visionResult.result,
        }]);
      } catch (err) {
        state.toolContext = appendToolContext(state.toolContext, [{
          tipo: "ver_tela",
          ok: false,
          result: err?.message || String(err),
        }]);
      }
    }

    debugRun("continueRun.loop", {
      runId: state.runId,
      step: state.step,
      maxSteps: state.maxSteps,
      toolContextSize: String(state.toolContext || "").length,
    });
    const system = buildSystemPrompt({
      memoria: state.memoria,
      memoriaPersistente: state.memoriaPersistente,
      conversaRecente: state.conversaRecente,
      conhecimento: state.conhecimento,
      specialistNotes: state.specialistNotes,
      relevantPlaybooks: state.relevantPlaybooks,
      learnedActionSummary: state.learnedActionSummary,
      learnedSkillSummary: state.learnedSkillSummary,
      learnedAnswerSummary: state.learnedAnswerSummary,
      infraProtocol: state.infraProtocol,
      screenContext: state.screenContext,
      worldState: formatWorldState(state.worldState),
      missions: state.missionStore.format(state.missionsData),
      workspaceExpertise: state.workspaceExpertiseSummary,
      perfil: state.perfil,
      agencyRoster: state.agencyRoster,
      agencyPlan: state.agencyPlan,
      agencyRef: state.agencyRef,
      brainContent: state.brainContent,
      providerName: state.llmConfig?.provider || (state.llmConfig?.ollamaBaseUrl ? "ollama" : "mistral"),
    });

    const messages = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          "TAREFA DO USUARIO:",
          state.pergunta,
          state.alocacaoUrl ? `\nSITE ALOCADO (contexto): ${state.alocacaoUrl}` : "",
          state.workspaceId ? `\nWORKSPACE: ${state.workspaceId}` : "",
          state.screenContext ? `\nTELA ATIVA: ${state.screenContext}` : "",
          Array.isArray(state.wsCfg?.metas) && state.wsCfg.metas.length ? `\nMETAS DO WORKSPACE:\n- ${state.wsCfg.metas.join("\n- ")}` : "",
          state.dominantSpecialties?.length ? `\nAREAS ONDE JA EXISTE MAIS ESPECIALIZACAO: ${state.dominantSpecialties.join(", ")}` : "",
          state.relevantPlaybooks ? `\nPLAYBOOKS RELEVANTES:\n${state.relevantPlaybooks}` : "",
          state.agencyRoster ? `\nESPECIALISTAS SELECIONADOS: ${state.agencyRoster}` : "",
          state.agencyPlan ? `\nPLANO INICIAL DOS ESPECIALISTAS:\n${state.agencyPlan}` : "",
          state.toolContext ? "\nCONTEXTO DE FERRAMENTAS:\n" + state.toolContext : "",
          state.lastText ? "\nSUA ULTIMA RESPOSTA:\n" + state.lastText : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];

    let completion;
    try {
      const canHandleLocally =
        shouldShortCircuitLocally(state.pergunta) ||
        assessLocalRoute({
          pergunta: state.pergunta,
          context: {
            alocacaoUrl: state.alocacaoUrl,
            workspaceId: state.workspaceId,
            learnedActionPatterns: state.learnedActionPatterns,
            learnedActionSequences: state.learnedActionSequences,
            relevantSkills: state.relevantSkills,
            learnedAnswers: state.learnedAnswers,
            hasScreenFrame: state.sessionId ? hasScreenFrame(state.sessionId) : false,
          },
        }).shouldHandleLocally;
      if (!shouldUseRemoteLlm() || canHandleLocally) {
        throw new Error("remote-llm-disabled");
      }
      completion = await chatCompletions({
        ...state.llmConfig,
        messages,
        temperature: state.temperature,
      });
      debugRun("continueRun.llm.remote", {
        runId: state.runId,
        provider: completion?.provider || state.llmConfig?.provider || "mistral",
        model: completion?.model || state.llmConfig?.model || null,
      });
    } catch {
      completion = await localChatCompletion({
        pergunta: state.pergunta,
        conhecimento: state.conhecimento,
        memoria: state.memoria,
        memoriaPersistente: state.memoriaPersistente,
        conversaRecente: state.conversaRecente,
        agencyRef: state.agencyRef,
        toolContext: state.toolContext,
        context: {
          alocacaoUrl: state.alocacaoUrl,
          workspaceId: state.workspaceId,
          workspaceExpertiseSummary: state.workspaceExpertiseSummary,
          agencyPlan: state.agencyPlan,
          agencyRoster: state.agencyRoster,
          relevantPlaybooks: state.relevantPlaybooks,
          specialistNotes: state.specialistNotes,
          learnedActionPatterns: state.learnedActionPatterns,
          learnedActionSequences: state.learnedActionSequences,
          relevantSkills: state.relevantSkills,
          learnedAnswers: state.learnedAnswers,
          hasScreenFrame: state.sessionId ? hasScreenFrame(state.sessionId) : false,
        },
      });
      const localRoute = assessLocalRoute({
        pergunta: state.pergunta,
        context: {
          alocacaoUrl: state.alocacaoUrl,
          workspaceId: state.workspaceId,
          learnedActionPatterns: state.learnedActionPatterns,
          learnedActionSequences: state.learnedActionSequences,
          relevantSkills: state.relevantSkills,
          learnedAnswers: state.learnedAnswers,
          hasScreenFrame: state.sessionId ? hasScreenFrame(state.sessionId) : false,
        },
      });
      debugRun("continueRun.llm.localFallback", {
        runId: state.runId,
        shortCircuit: shouldShortCircuitLocally(state.pergunta),
        localConfidence: localRoute.confidence,
        localReasons: localRoute.reasons,
      });
    }

    const { content, raw } = completion;
    const parsed = extractJsonObject(content) || extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Resposta invalida da IA (JSON)", runId: state.runId };
    }

    const texto = typeof parsed.texto === "string" ? parsed.texto : "";
    const fala = pickSpeechText(parsed);
    let acoes = normalizeActions(parsed.acoes);
    let finalTexto = texto;
    let finalFala = fala;
    const reusedAnswerKey = parsed?.aprendizado?.reusedAnswerKey ? String(parsed.aprendizado.reusedAnswerKey) : "";
    const instructionalOnly =
      (isInstructionalQuery(state.pergunta) || isConsultativeQuestion(state.pergunta)) &&
      !isExplicitExecutionRequest(state.pergunta);
    if (instructionalOnly) {
      const adapted = adaptInstructionalResponse({
        question: state.pergunta,
        texto: finalTexto,
        fala: finalFala,
        acoes,
      });
      finalTexto = adapted.texto;
      finalFala = adapted.fala;
      acoes = Array.isArray(adapted.acoes) ? adapted.acoes : [];
    }
    if (
      !isExplicitExecutionRequest(state.pergunta) &&
      (isConsultativeQuestion(state.pergunta) || looksMetaResponse(finalTexto || "")) &&
      acoes.some((item) => ["executar_shell", "browser_run", "desktop_abrir_app", "desktop_abrir_links", "desktop_abrir_multiplos", "desktop_abrir_janelas_browser"].includes(String(item?.tipo || "")))
    ) {
      const shellAction = acoes.find((item) => item?.tipo === "executar_shell" && String(item?.dados?.cmd || "").trim());
      finalTexto = shellAction
        ? `Comando sugerido:\n\`${String(shellAction.dados.cmd || "").trim()}\``
        : finalTexto || "Posso te responder em texto sem executar nada automaticamente.";
      finalFala = shellAction ? "Coloquei o comando no texto." : "Posso te responder em texto.";
      acoes = [];
    }
    state.lastText = finalTexto || state.lastText;
    state.lastSpeech = finalFala || state.lastSpeech;
    if (reusedAnswerKey && state.answerLearningStore?.markReuse) {
      await state.answerLearningStore.markReuse(state.workspaceId, reusedAnswerKey);
    }
    debugRun("continueRun.parsed", {
      runId: state.runId,
      textoPreview: String(finalTexto || "").slice(0, 140),
      acoes: acoes.map((item) => item.tipo),
    });

    const { client, server } = splitActions(acoes);
    if (client.length) state.clientActions = state.clientActions.concat(client);

    if (!server.length) {
      if (memoryStore) {
        await memoryStore.saveTurn(state.workspaceId, state.pergunta, state.lastText || texto || "Ok.");
      }
      await persistAnswerLearning({
        answerLearningStore: state.answerLearningStore,
        workspaceId: state.workspaceId,
        pergunta: state.pergunta,
        texto: state.lastText || texto || "Ok.",
        acoes,
      });
      await armPendingAnswerFeedback({
        answerLearningStore: state.answerLearningStore,
        workspaceId: state.workspaceId,
        pergunta: state.pergunta,
        texto: state.lastText || texto || "Ok.",
        acoes,
      });
      state.wsCfg = await updateWorkspaceExpertise({
        workspaces: state.workspaces,
        workspaceId: state.workspaceId,
        wsCfg: state.wsCfg,
        pergunta: state.pergunta,
        results: [],
      });
      await refreshWorkspaceIntelligence({ state, knowledgeStore });
      await state.worldStateStore.set(state.workspaceId, {
        status: "idle",
        currentFocus: state.pergunta,
        activeGoals: uniqueGoals([state.pergunta, ...(state.worldState?.activeGoals || [])]),
        openLoops: [],
      });
      await state.missionStore.close(state.workspaceId, inferMissionTitle(state.pergunta), {
        summary: state.lastText || texto || state.pergunta,
        nextStep: "Aguardando nova orientacao",
      });

      getRuns().delete(state.runId);
      debugRun("continueRun.finish.noServerActions", {
        runId: state.runId,
        textoPreview: String(state.lastText || "Ok.").slice(0, 140),
      });
      return {
        ok: true,
        runId: state.runId,
        texto: state.lastText || "Ok.",
        fala: state.lastSpeech || pickSpeechText({ texto: state.lastText || "Ok." }),
        acoes: state.clientActions,
      };
    }

    const pending = server.filter((a) => actionRequiresApproval(a.tipo));
    const autoExec = server.filter((a) => !actionRequiresApproval(a.tipo));

    const autoResults = [];
    for (const action of autoExec) {
      try {
        const r = await executeServerAction({
          action,
          baseDir: state.baseDir,
          knowledgeStore,
          context: {
            sessionId: state.sessionId,
            workspaceId: state.workspaceId,
            alocacaoUrl: state.alocacaoUrl,
          },
        });
        autoResults.push({ tipo: action.tipo, ok: r.ok, result: r.result, action });
      } catch (err) {
        autoResults.push({ tipo: action.tipo, ok: false, result: err?.message || String(err), action });
      }
    }

    state.toolContext = appendToolContext(state.toolContext, autoResults);
    debugRun("continueRun.autoResults", {
      runId: state.runId,
      results: autoResults.map((item) => ({ tipo: item.tipo, ok: item.ok })),
      pending: pending.map((item) => item.tipo),
    });
    await updateWorldStateFromResults({
      worldStateStore: state.worldStateStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results: autoResults,
    });
    await persistSupervisorLearning({
      knowledgeStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results: autoResults,
    });
    await persistActionLearning({
      actionLearningStore: state.actionLearningStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results: autoResults,
    });
    await persistSkillsLearning({
      skillsStore: state.skillsStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results: autoResults,
    });
    await updateMissionStore({
      missionStore: state.missionStore,
      workspaceId: state.workspaceId,
      question: state.pergunta,
      text: state.lastText,
      results: autoResults,
      pendingLabels: pending.map((item) => actionLabel(item)),
    });
    state.wsCfg = await updateWorkspaceExpertise({
      workspaces: state.workspaces,
      workspaceId: state.workspaceId,
      wsCfg: state.wsCfg,
      pergunta: state.pergunta,
      results: autoResults,
    });
    await refreshWorkspaceIntelligence({ state, knowledgeStore });
    state.worldState = await state.worldStateStore.get(state.workspaceId);
    state.missionsData = await state.missionStore.list(state.workspaceId);

    if (pending.length) {
      state.pending = pending.map((action) => ({ id: newId(), action, label: actionLabel(action) }));
      await state.worldStateStore.set(state.workspaceId, {
        status: "awaiting_approval",
        currentFocus: state.pergunta,
        openLoops: uniqueGoals(pending.map((item) => actionLabel(item)).concat(state.pergunta)),
      });
      state.worldState = await state.worldStateStore.get(state.workspaceId);

      return {
        ok: true,
        runId: state.runId,
        texto: state.lastText || "Preciso de aprovacao para continuar.",
        fala: state.lastSpeech || "Preciso da sua aprovacao para continuar.",
        acoes: state.clientActions,
        pendencias: state.pending.map((p) => ({ id: p.id, label: p.label, action: p.action })),
      };
    }
  }

  if (memoryStore) {
    await memoryStore.saveTurn(state.workspaceId, state.pergunta, state.lastText || "Ok.");
  }
  await persistAnswerLearning({
    answerLearningStore: state.answerLearningStore,
    workspaceId: state.workspaceId,
    pergunta: state.pergunta,
    texto: state.lastText || "Ok.",
    acoes: state.clientActions,
  });
  await armPendingAnswerFeedback({
    answerLearningStore: state.answerLearningStore,
    workspaceId: state.workspaceId,
    pergunta: state.pergunta,
    texto: state.lastText || "Ok.",
    acoes: state.clientActions,
  });
  state.wsCfg = await updateWorkspaceExpertise({
    workspaces: state.workspaces,
    workspaceId: state.workspaceId,
    wsCfg: state.wsCfg,
    pergunta: state.pergunta,
    results: [],
  });
  await refreshWorkspaceIntelligence({ state, knowledgeStore });
  await state.worldStateStore.set(state.workspaceId, {
    status: "idle",
    currentFocus: state.pergunta,
    activeGoals: uniqueGoals([state.pergunta, ...(state.worldState?.activeGoals || [])]),
  });
  getRuns().delete(state.runId);
  debugRun("continueRun.finish.maxSteps", {
    runId: state.runId,
    textoPreview: String(state.lastText || "Ok.").slice(0, 140),
  });
  return {
    ok: true,
    runId: state.runId,
    texto: state.lastText || "Ok.",
    fala: state.lastSpeech || pickSpeechText({ texto: state.lastText || "Ok." }),
    acoes: state.clientActions,
  };
}
