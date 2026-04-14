import path from "path";
import fs from "fs/promises";
import { buildToolsPrompt, CLIENT_ACTIONS, executeServerAction } from "./tools.js";
import { extractJsonObject } from "./json.js";
import { chatCompletions } from "./llm.js";
import { localChatCompletion, shouldShortCircuitLocally } from "./localBrain.js";
import { loadAgencyReference } from "./agencyReference.js";

function shouldUseRemoteLlm() {
  return process.env.KIARA_REMOTE_LLM !== "0";
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
    infraestrutura: "Especialista em infraestrutura (Linux, Docker, redes, processos, logs, deploy, servidores, troubleshooting).",
    infra: "Especialista em infraestrutura (Linux, Docker, redes, processos, logs, deploy, servidores, troubleshooting).",
    linux: "Especialista em Linux (usuarios, permissoes, processos, servicos, logs, shell e administracao de servidores).",
    docker: "Especialista em Docker (containers, imagens, compose, redes, volumes, troubleshooting e deploy).",
    "meta-ads": "Especialista em Meta Ads (estrutura de campanhas, publicos, criativos, mensuracao, CAPI, testes, otimizacao).",
    builder: "Especialista em construir aplicacoes (especificacao, arquitetura, backlog, UX minima, implementacao incremental).",
    professor: "Especialista em ensino (explica do zero ao avancado, com exemplos, exercicios e verificacao de entendimento).",
  };

  return map[p] ? `PERFIL: ${map[p]}` : `PERFIL: ${perfil}`;
}

function buildSystemPrompt({ memoria, conversaRecente, conhecimento, perfil, brainContent, providerName }) {
  return `
Voce e KIARA.
Uma IA autonoma, analitica e conversacional.

Objetivo: ajudar o usuario, conversar com fluidez, agir quando necessario e aprender localmente.
Provider atual: ${providerName || "desconhecido"}.

${profilePrompt(perfil)}

ESTILO:
- Seja natural, inteligente e continua na conversa.
- Reaproveite memoria recente e conhecimento local antes de buscar fora.
- Quando investigar algo, explique o raciocinio de forma humana.

METODO:
1. Analise criticamente os dados recebidos.
2. Se uma ferramenta retornar erro, tente corrigir a busca.
3. Sempre que aprender algo util e geral, use "salvar_nota".
4. Se descobrir uma regra mestre de comportamento ou negocio, sugira atualizar o "kiara_brain.md".
5. Para investigacao profunda, use "pesquisar_web" com { "profundo": true }.
6. Em temas de infraestrutura, Linux e Docker, priorize diagnostico sistematico: contexto, sintomas, logs, processos, rede, volumes, permissoes e rollback.

POLITICA DE SEGURANCA:
- So use "salvar_nota" se o usuario pedir para lembrar, ou se for um aprendizado generico.
- Evite sugerir "executar_shell" e "escrever_arquivo" a menos que o usuario peca explicitamente.
- Para automacao em sites, prefira "pesquisar_web" + "navegar". Use "browser_run" quando precisar interagir.

CONHECIMENTO SALVO:
${conhecimento || "(vazio)"}

CONVERSA RECENTE:
${conversaRecente || "(vazia)"}

MEMORIA RECENTE:
${memoria || "(vazia)"}

NUCLEO DE IDENTIDADE (kiara_brain.md):
${brainContent || "(vazio)"}

${buildToolsPrompt()}
`.trim();
}

function normalizeActions(acoes) {
  if (!Array.isArray(acoes)) return [];
  return acoes
    .map((a) => ({ tipo: a?.tipo, dados: a?.dados ?? {} }))
    .filter((a) => typeof a.tipo === "string" && a.tipo.length);
}

function appendToolContext(current, results) {
  if (!Array.isArray(results) || !results.length) return current || "";
  const chunk = results.map((r) => `ACAO: ${r.tipo}\nOK: ${r.ok}\nRESULTADO:\n${r.result}`).join("\n\n");
  return [current, chunk].filter(Boolean).join("\n\n");
}

export async function runKiaraAgent({
  pergunta,
  perfil,
  alocacaoUrl,
  sessionId,
  workspaceId = "default",
  memoryStore,
  knowledgeStore,
  maxSteps = 4,
  model,
  temperature = 0.45,
  baseDir,
  llmConfig,
}) {
  const safeBaseDir = baseDir || path.resolve(".");
  const memoria = memoryStore ? await memoryStore.getRelevant(workspaceId, pergunta) : "";
  const conversaRecente = memoryStore?.getRecent ? await memoryStore.getRecent(workspaceId, { limit: 8 }) : "";
  const conhecimento = knowledgeStore ? await knowledgeStore.search(workspaceId, pergunta) : "";
  const agencyRef = await loadAgencyReference({ baseDir: safeBaseDir, perfil, pergunta });

  let brainContent = "";
  try {
    const brainPath = path.join(safeBaseDir, "kiara_brain.md");
    brainContent = await fs.readFile(brainPath, "utf8");
  } catch {
    brainContent = "";
  }

  let toolContext = "";
  let lastText = "";
  let clientActions = [];

  for (let step = 0; step < maxSteps; step++) {
    const system = buildSystemPrompt({
      memoria,
      conversaRecente,
      conhecimento,
      perfil,
      brainContent,
      providerName: llmConfig?.provider || (llmConfig?.ollamaBaseUrl ? "ollama" : "mistral"),
    });

    const messages = [
      {
        role: "system",
        content: [system, agencyRef ? `\n\nREFERENCIA (agency-agents):\n${agencyRef}` : ""].filter(Boolean).join(""),
      },
      {
        role: "user",
        content: [
          "TAREFA DO USUARIO:",
          String(pergunta),
          alocacaoUrl ? `\nSITE ALOCADO (contexto): ${alocacaoUrl}` : "",
          toolContext ? "\nCONTEXTO DE FERRAMENTAS (resultados anteriores):\n" + toolContext : "",
          lastText ? "\nSUA ULTIMA RESPOSTA (para continuar com consistencia):\n" + lastText : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];

    let completion;
    try {
      if (!shouldUseRemoteLlm() || shouldShortCircuitLocally(pergunta)) {
        throw new Error("remote-llm-disabled");
      }
      completion = await chatCompletions({
        ...(llmConfig || {}),
        model: model || llmConfig?.model,
        messages,
        temperature,
      });
    } catch {
      completion = await localChatCompletion({
        pergunta,
        conhecimento,
        memoria,
        conversaRecente,
        agencyRef,
        toolContext,
        context: {
          alocacaoUrl,
          workspaceId,
        },
      });
    }

    const { content, raw } = completion;

    const parsed = extractJsonObject(content) || extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") {
      const err = new Error("Resposta invalida da IA (JSON)");
      err.ai = content;
      throw err;
    }

    const texto = typeof parsed.texto === "string" ? parsed.texto : "";
    const acoes = normalizeActions(parsed.acoes);
    lastText = texto || lastText;

    const serverActions = acoes.filter((a) => !CLIENT_ACTIONS.has(a.tipo));
    const nextClient = acoes.filter((a) => CLIENT_ACTIONS.has(a.tipo));
    if (nextClient.length) clientActions = clientActions.concat(nextClient);

    if (!serverActions.length) {
      return { texto: texto || "Ok.", acoes: clientActions };
    }

    const results = [];
    for (const action of serverActions) {
      try {
        const r = await executeServerAction({
          action,
          baseDir: safeBaseDir,
          knowledgeStore,
          context: { sessionId, workspaceId, alocacaoUrl },
        });
        results.push({ tipo: action.tipo, ok: r.ok, result: r.result });
      } catch (err) {
        results.push({ tipo: action.tipo, ok: false, result: err?.message || String(err) });
      }
    }

    toolContext = appendToolContext(toolContext, results);
  }

  return {
    texto: lastText || "Conclui o maximo que consegui com as ferramentas disponiveis.",
    acoes: clientActions,
  };
}
