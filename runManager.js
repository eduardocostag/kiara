import path from "path";
import fs from "fs/promises";
import { extractJsonObject } from "./json.js";
import { mistralChatCompletions } from "./mistral.js";
import { buildToolsPrompt, CLIENT_ACTIONS, executeServerAction, actionRequiresApproval } from "./tools.js";
import { loadAgencyReference } from "./agencyReference.js";
import { createWorkspaceStore } from "./workspaceStore.js";

function getRuns() {
  if (!globalThis.__KIARA_RUNS) globalThis.__KIARA_RUNS = new Map();
  return globalThis.__KIARA_RUNS;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function profilePrompt(perfil) {
  const p = String(perfil || "").toLowerCase().trim();
  if (!p) return "";

  const map = {
    marketing:
      "Especialista em marketing (copy, funil, tráfego, SEO, conteúdo, CRM, análise de concorrência).",
    gestao:
      "Especialista em gestão (processos, OKRs, priorização, operação, liderança, produtividade).",
    financas:
      "Especialista em finanças (orçamento, fluxo de caixa, valuation, métricas, precificação, risco).",
    automacoes:
      "Especialista em automações (APIs, integrações, scripts, RPA, no-code/low-code, tarefas recorrentes).",
    tecnologia:
      "Especialista em tecnologia (arquitetura, dev, segurança, cloud, dados, boas práticas).",
    "meta-ads":
      "Especialista em Meta Ads (estrutura de campanhas, públicos, criativos, mensuração, CAPI, testes, otimização).",
    builder:
      "Especialista em construir aplicações (especificação, arquitetura, backlog, UX mínima, implementação incremental).",
    professor:
      "Especialista em ensino (explica do zero ao avançado, com exemplos, exercícios e verificação de entendimento).",
  };

  return map[p] ? `PERFIL: ${map[p]}` : `PERFIL: ${perfil}`;
}

function buildSystemPrompt({ memoria, conhecimento, perfil, agencyRef, brainContent }) {
  return `
Você é KIARA.
Uma IA autônoma projetada para agir sem supervisão constante.

Seu "Cérebro" (kiara_brain.md) é sua lei absoluta. Antes de cada resposta, consulte suas diretrizes.

${profilePrompt(perfil)}

POLÍTICA DE SEGURANÇA:
- Para ações arriscadas (browser_run, escrever_arquivo, executar_shell), SEMPRE peça aprovação antes de executar.
- Para automação em sites, prefira "pesquisar_web" + "navegar". Use "browser_run" apenas quando necessário interagir (cliques/inputs) e respeite a allowlist de domínios.
- Só use "salvar_nota" se o usuário pedir para lembrar, ou se for um aprendizado genérico (sem dados pessoais/segredos).
- Seja analítica: explique hipóteses, métricas e o porquê das decisões (marketing/finanças).
- Para "buscar leads": peça nicho + região e, se quiser "abertas recentemente", peça um ano/data. Use a ação "buscar_leads" e devolva lista com fonte; deixe claro que é heurístico via web.
- Se existir um "site alocado" e o usuário pedir diagnóstico/marketing/SEO, use "site_audit" antes de propor o plano (quando fizer sentido).
- Se o usuário perguntar "consegue ver minha tela?" ou pedir opinião do que aparece, use "ver_tela" (se a tela estiver ativa).
- Se o usuário pedir “criar automação/agente”, proponha um playbook e use "criar_automacao" para salvar (workspace) quando útil.
- **AUTONOMIA E APRENDIZADO**: Se você descobrir um padrão de sucesso, uma regra de negócio imutável ou um erro que não deve ser repetido, use a ferramenta "escrever_arquivo" no caminho "kiara_brain.md" para atualizar suas próprias diretrizes.

CONHECIMENTO SALVO:
${conhecimento || "(vazio)"}

NÚCLEO DE IDENTIDADE (kiara_brain.md):
${brainContent || "(vazio)"}

MEMÓRIA RECENTE:
${memoria || "(vazia)"}

${agencyRef ? `\nREFERÊNCIA (agency-agents):\n${agencyRef}\n` : ""}

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
  if (!a?.tipo) return "(ação)";
  if (a.tipo === "browser_run") return `Automatizar site: ${a?.dados?.url || ""}`.trim();
  if (a.tipo === "executar_shell") return `Executar comando: ${a?.dados?.cmd || ""}`.trim();
  if (a.tipo === "escrever_arquivo") return `Escrever arquivo: ${a?.dados?.path || ""}`.trim();
  if (a.tipo === "ver_tela") return `Analisar tela: ${a?.dados?.pergunta || ""}`.trim();
  if (a.tipo === "navegar") return `Navegar URL: ${a?.dados?.url || ""}`.trim();
  if (a.tipo === "pesquisar_web") return `Pesquisar web: ${a?.dados?.query || ""}`.trim();
  return a.tipo;
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
  mistralKey,
}) {
  const safeBaseDir = baseDir || path.resolve(".");
  const workspaces = createWorkspaceStore({ baseDir: safeBaseDir });
  const wid = workspaces.sanitizeWorkspaceId(workspaceId || sessionId || "default");
  const wsCfg = await workspaces.getWorkspace(wid);

  const effectiveAllocUrl = alocacaoUrl ? String(alocacaoUrl) : wsCfg.alocacaoUrl;
  if (alocacaoUrl) {
    await workspaces.setWorkspace(wid, { alocacaoUrl: String(alocacaoUrl) });
  }

  const memoria = memoryStore ? await memoryStore.getRelevant(wid, pergunta) : "";
  const conhecimento = knowledgeStore ? await knowledgeStore.search(wid, pergunta) : "";
  const agencyRef = await loadAgencyReference({ baseDir: safeBaseDir, perfil });
  
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
    model: "mistral-small-latest",
    temperature: 0.6,
    maxSteps: Boolean(autonoma) ? 4 : 1,
    step: 0,
    memoria,
    conhecimento,
    agencyRef,
    brainContent,
    toolContext: "",
    lastText: "",
    clientActions: [],
    pending: [],
    baseDir: safeBaseDir,
    mistralKey,
    createdAt: Date.now(),
  };

  getRuns().set(runId, state);
  return continueRun({ runId, approvals: {}, memoryStore, knowledgeStore });
}

export async function continueRun({ runId, approvals, memoryStore, knowledgeStore }) {
  const state = getRuns().get(String(runId));
  if (!state) {
    return { ok: false, error: "Run não encontrado (expirou ou reiniciou servidor)" };
  }

  // Execute pendências aprovadas (ou registre rejeição)
  if (Array.isArray(state.pending) && state.pending.length) {
    const results = [];
    for (const p of state.pending) {
      const decision = approvals?.[p.id];
      if (decision !== true) {
        results.push({
          tipo: p.action.tipo,
          ok: false,
          result: `AÇÃO REJEITADA PELO USUÁRIO: ${actionLabel(p.action)}`,
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
    state.toolContext = results
      .map((r) => `AÇÃO: ${r.tipo}\nOK: ${r.ok}\nRESULTADO:\n${r.result}`)
      .join("\n\n");
  }

  for (; state.step < state.maxSteps; state.step++) {
    const system = buildSystemPrompt({
      memoria: state.memoria,
      conhecimento: state.conhecimento,
      perfil: state.perfil,
      agencyRef: state.agencyRef,
      brainContent: state.brainContent,
    });

    const messages = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          "TAREFA DO USUÁRIO:",
          state.pergunta,
          state.alocacaoUrl ? `\nSITE ALOCADO (contexto): ${state.alocacaoUrl}` : "",
          state.workspaceId ? `\nWORKSPACE: ${state.workspaceId}` : "",
          Array.isArray(state.wsCfg?.metas) && state.wsCfg.metas.length
            ? `\nMETAS DO WORKSPACE:\n- ${state.wsCfg.metas.join("\n- ")}`
            : "",
          state.toolContext ? "\nCONTEXTO DE FERRAMENTAS:\n" + state.toolContext : "",
          state.lastText ? "\nSUA ÚLTIMA RESPOSTA:\n" + state.lastText : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];

    const { content, raw } = await mistralChatCompletions({
      apiKey: state.mistralKey,
      model: state.model,
      messages,
      temperature: state.temperature,
    });

    const parsed = extractJsonObject(content) || extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Resposta inválida da IA (JSON)", runId: state.runId };
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

      getRuns().delete(state.runId);
      return { ok: true, runId: state.runId, texto: state.lastText || "Ok.", acoes: state.clientActions };
    }

    // Se houver ações que exigem aprovação, pausa e retorna pendências
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

    state.toolContext = autoResults.length
      ? autoResults
          .map((r) => `AÇÃO: ${r.tipo}\nOK: ${r.ok}\nRESULTADO:\n${r.result}`)
          .join("\n\n")
      : "";

    if (pending.length) {
      state.pending = pending.map((action) => ({
        id: newId(),
        action,
        label: actionLabel(action),
      }));

      return {
        ok: true,
        runId: state.runId,
        texto: state.lastText || "Preciso de aprovação para continuar.",
        acoes: state.clientActions,
        pendencias: state.pending.map((p) => ({ id: p.id, label: p.label, action: p.action })),
      };
    }
  }

  if (memoryStore) {
    await memoryStore.saveTurn(state.workspaceId, state.pergunta, state.lastText || "Ok.");
  }
  getRuns().delete(state.runId);
  return { ok: true, runId: state.runId, texto: state.lastText || "Ok.", acoes: state.clientActions };
}
