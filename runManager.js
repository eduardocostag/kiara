import path from "path";
import fs from "fs/promises";
import { extractJsonObject } from "./json.js";
import { chatCompletions } from "./llm.js";
import { localChatCompletion } from "./localBrain.js";
import { buildToolsPrompt, CLIENT_ACTIONS, executeServerAction, actionRequiresApproval } from "./tools.js";
import { loadAgencyReference } from "./agencyReference.js";
import { createWorkspaceStore } from "./workspaceStore.js";
import { createWorldStateStore } from "./worldStateStore.js";

function getRuns() {
  if (!globalThis.__KIARA_RUNS) globalThis.__KIARA_RUNS = new Map();
  return globalThis.__KIARA_RUNS;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uniqueGoals(items) {
  return [...new Set((items || []).filter(Boolean))].slice(0, 6);
}

function profilePrompt(perfil) {
  const p = String(perfil || "").toLowerCase().trim();
  if (!p) return "";

  const map = {
    marketing: "Especialista em marketing (copy, funil, trafego, SEO, conteudo, CRM, analise de concorrencia).",
    gestao: "Especialista em gestao (processos, OKRs, priorizacao, operacao, lideranca, produtividade).",
    financas: "Especialista em financas (orcamento, fluxo de caixa, valuation, metricas, precificacao, risco).",
    automacoes: "Especialista em automacoes (APIs, integracoes, scripts, RPA, no-code/low-code, tarefas recorrentes).",
    tecnologia: "Especialista em tecnologia (arquitetura, dev, seguranca, cloud, dados, boas praticas).",
    "meta-ads": "Especialista em Meta Ads (estrutura de campanhas, publicos, criativos, mensuracao, CAPI, testes, otimizacao).",
    builder: "Especialista em construir aplicacoes (especificacao, arquitetura, backlog, UX minima, implementacao incremental).",
    professor: "Especialista em ensino (explica do zero ao avancado, com exemplos, exercicios e verificacao de entendimento).",
  };

  return map[p] ? `PERFIL: ${map[p]}` : `PERFIL: ${perfil}`;
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

function buildSystemPrompt({ memoria, conversaRecente, conhecimento, worldState, perfil, agencyRef, brainContent, providerName }) {
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
- Se souber algo pelo conhecimento local, pelo estado do mundo do workspace ou pela memoria recente, reutilize antes de depender de busca externa.
- Quando fizer pesquisa ou automacao, explique em linguagem humana o que encontrou e o que ainda falta validar.

POLITICA DE SEGURANCA:
- Para acoes arriscadas (browser_run, escrever_arquivo, executar_shell), sempre peca aprovacao antes de executar.
- Para automacao em sites, prefira "pesquisar_web" + "navegar". Use "browser_run" quando precisar clicar, preencher ou iterar em paginas.
- So use "salvar_nota" se o usuario pedir para lembrar, ou se for um aprendizado generico util para o futuro.
- Se a pergunta exigir "buscar a fundo", use "pesquisar_web" com { "profundo": true }.
- Se existir um "site alocado" e o usuario pedir diagnostico/marketing/SEO, use "site_audit" antes de propor o plano quando fizer sentido.
- Se o usuario pedir criar uma automacao ou agente, proponha um playbook e use "criar_automacao" quando houver valor.
- Se descobrir padrao de sucesso, regra de negocio importante ou preferencia persistente do usuario, use "salvar_nota" para aprender localmente.

CONHECIMENTO SALVO:
${conhecimento || "(vazio)"}

CONVERSA RECENTE:
${conversaRecente || "(vazia)"}

MEMORIA RELACIONADA:
${memoria || "(vazia)"}

ESTADO DO MUNDO DO WORKSPACE:
${worldState || "(vazio)"}

NUCLEO DE IDENTIDADE (kiara_brain.md):
${brainContent || "(vazio)"}

${agencyRef ? `\nREFERENCIA (agency-agents):\n${agencyRef}\n` : ""}

${buildToolsPrompt()}
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
  const safeBaseDir = baseDir || path.resolve(".");
  const workspaces = createWorkspaceStore({ baseDir: safeBaseDir });
  const worldStateStore = createWorldStateStore({ baseDir: safeBaseDir });
  const wid = workspaces.sanitizeWorkspaceId(workspaceId || sessionId || "default");
  const wsCfg = await workspaces.getWorkspace(wid);

  const effectiveAllocUrl = alocacaoUrl ? String(alocacaoUrl) : wsCfg.alocacaoUrl;
  if (alocacaoUrl) {
    await workspaces.setWorkspace(wid, { alocacaoUrl: String(alocacaoUrl) });
  }

  const memoria = memoryStore ? await memoryStore.getRelevant(wid, pergunta) : "";
  const conversaRecente = memoryStore?.getRecent ? await memoryStore.getRecent(wid, { limit: 8 }) : "";
  const conhecimento = knowledgeStore ? await knowledgeStore.search(wid, pergunta) : "";
  const worldState = await worldStateStore.get(wid);
  const agencyRef = await loadAgencyReference({ baseDir: safeBaseDir, perfil, pergunta });

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
    wsCfg,
    alocacaoUrl: effectiveAllocUrl ? String(effectiveAllocUrl) : null,
    sessionId: sessionId ? String(sessionId) : null,
    llmConfig: { ...(llmConfig || {}), model: llmConfig?.model || "mistral-small-latest" },
    temperature: 0.45,
    maxSteps: Boolean(autonoma) ? 5 : 2,
    step: 0,
    memoria,
    conversaRecente,
    conhecimento,
    worldState,
    agencyRef,
    brainContent,
    toolContext: "",
    lastText: "",
    clientActions: [],
    pending: [],
    baseDir: safeBaseDir,
    worldStateStore,
    createdAt: Date.now(),
  };

  getRuns().set(runId, state);
  await state.worldStateStore.set(state.workspaceId, {
    status: "working",
    currentFocus: state.pergunta,
    activeGoals: uniqueGoals([state.pergunta, ...(state.worldState?.activeGoals || [])]),
  });
  state.worldState = await state.worldStateStore.get(state.workspaceId);
  return continueRun({ runId, approvals: {}, memoryStore, knowledgeStore });
}

export async function continueRun({ runId, approvals, memoryStore, knowledgeStore }) {
  const state = getRuns().get(String(runId));
  if (!state) {
    return { ok: false, error: "Run nao encontrado (expirou ou reiniciou servidor)" };
  }

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
        results.push({ tipo: p.action.tipo, ok: r.ok, result: r.result });
      } catch (err) {
        results.push({ tipo: p.action.tipo, ok: false, result: err?.message || String(err) });
      }
    }

    state.pending = [];
    state.toolContext = appendToolContext(state.toolContext, results);
    await updateWorldStateFromResults({
      worldStateStore: state.worldStateStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results,
    });
    state.worldState = await state.worldStateStore.get(state.workspaceId);
    await persistSupervisorLearning({
      knowledgeStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results,
    });
  }

  for (; state.step < state.maxSteps; state.step++) {
    const system = buildSystemPrompt({
      memoria: state.memoria,
      conversaRecente: state.conversaRecente,
      conhecimento: state.conhecimento,
      worldState: formatWorldState(state.worldState),
      perfil: state.perfil,
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
          Array.isArray(state.wsCfg?.metas) && state.wsCfg.metas.length ? `\nMETAS DO WORKSPACE:\n- ${state.wsCfg.metas.join("\n- ")}` : "",
          state.toolContext ? "\nCONTEXTO DE FERRAMENTAS:\n" + state.toolContext : "",
          state.lastText ? "\nSUA ULTIMA RESPOSTA:\n" + state.lastText : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];

    let completion;
    try {
      completion = await chatCompletions({
        ...state.llmConfig,
        messages,
        temperature: state.temperature,
      });
    } catch {
      completion = await localChatCompletion({
        pergunta: state.pergunta,
        conhecimento: state.conhecimento,
        memoria: state.memoria,
        conversaRecente: state.conversaRecente,
        agencyRef: state.agencyRef,
        toolContext: state.toolContext,
        context: {
          alocacaoUrl: state.alocacaoUrl,
          workspaceId: state.workspaceId,
        },
      });
    }

    const { content, raw } = completion;
    const parsed = extractJsonObject(content) || extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Resposta invalida da IA (JSON)", runId: state.runId };
    }

    const texto = typeof parsed.texto === "string" ? parsed.texto : "";
    const acoes = normalizeActions(parsed.acoes);
    state.lastText = texto || state.lastText;

    const { client, server } = splitActions(acoes);
    if (client.length) state.clientActions = state.clientActions.concat(client);

    if (!server.length) {
      if (memoryStore) {
        await memoryStore.saveTurn(state.workspaceId, state.pergunta, state.lastText || texto || "Ok.");
      }
      await state.worldStateStore.set(state.workspaceId, {
        status: "idle",
        currentFocus: state.pergunta,
        activeGoals: uniqueGoals([state.pergunta, ...(state.worldState?.activeGoals || [])]),
        openLoops: [],
      });

      getRuns().delete(state.runId);
      return { ok: true, runId: state.runId, texto: state.lastText || "Ok.", acoes: state.clientActions };
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
        autoResults.push({ tipo: action.tipo, ok: r.ok, result: r.result });
      } catch (err) {
        autoResults.push({ tipo: action.tipo, ok: false, result: err?.message || String(err) });
      }
    }

    state.toolContext = appendToolContext(state.toolContext, autoResults);
    await updateWorldStateFromResults({
      worldStateStore: state.worldStateStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results: autoResults,
    });
    state.worldState = await state.worldStateStore.get(state.workspaceId);
    await persistSupervisorLearning({
      knowledgeStore,
      workspaceId: state.workspaceId,
      pergunta: state.pergunta,
      results: autoResults,
    });

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
        acoes: state.clientActions,
        pendencias: state.pending.map((p) => ({ id: p.id, label: p.label, action: p.action })),
      };
    }
  }

  if (memoryStore) {
    await memoryStore.saveTurn(state.workspaceId, state.pergunta, state.lastText || "Ok.");
  }
  await state.worldStateStore.set(state.workspaceId, {
    status: "idle",
    currentFocus: state.pergunta,
    activeGoals: uniqueGoals([state.pergunta, ...(state.worldState?.activeGoals || [])]),
  });
  getRuns().delete(state.runId);
  return { ok: true, runId: state.runId, texto: state.lastText || "Ok.", acoes: state.clientActions };
}
