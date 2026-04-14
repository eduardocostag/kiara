import path from "path";
import fs from "fs/promises";
import { buildToolsPrompt, CLIENT_ACTIONS, executeServerAction } from "./tools.js";
import { extractJsonObject } from "./json.js";
<<<<<<< HEAD
import { chatCompletions } from "./llm.js";
import { localChatCompletion } from "./localBrain.js";
=======
import { mistralChatCompletions } from "./mistral.js";
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
import { loadAgencyReference } from "./agencyReference.js";

function profilePrompt(perfil) {
  const p = String(perfil || "").toLowerCase().trim();
  if (!p) return "";

  const map = {
<<<<<<< HEAD
    marketing: "Especialista em marketing (copy, funil, trafego, SEO, conteudo, CRM, analise de concorrencia).",
    gestao: "Especialista em gestao (processos, OKRs, priorizacao, operacao, lideranca, produtividade).",
    financas: "Especialista em financas (orcamento, fluxo de caixa, valuation, metricas, precificacao, risco).",
    automacoes: "Especialista em automacoes (APIs, integracoes, scripts, RPA, no-code/low-code, tarefas recorrentes).",
    tecnologia: "Especialista em tecnologia (arquitetura, dev, seguranca, cloud, dados, boas praticas).",
    "meta-ads": "Especialista em Meta Ads (estrutura de campanhas, publicos, criativos, mensuracao, CAPI, testes, otimizacao).",
    builder: "Especialista em construir aplicacoes (especificacao, arquitetura, backlog, UX minima, implementacao incremental).",
    professor: "Especialista em ensino (explica do zero ao avancado, com exemplos, exercicios e verificacao de entendimento).",
=======
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
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
  };

  return map[p] ? `PERFIL: ${map[p]}` : `PERFIL: ${perfil}`;
}

<<<<<<< HEAD
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

=======
function buildSystemPrompt({ memoria, conhecimento, perfil, brainContent }) {
  return `
Você é KIARA.
Uma IA autônoma e analítica.

Objetivo: ajudar o usuário e executar ações quando necessário.

${profilePrompt(perfil)}

MÉTODO:
1. Analise criticamente os dados recebidos.
2. Se uma ferramenta retornar erro, tente corrigir sua busca.
3. Sempre que aprender algo novo sobre o usuário, use "salvar_nota".
4. Se descobrir uma regra mestre de comportamento ou negócio, sugira atualizar o "kiara_brain.md".

POLÍTICA DE SEGURANÇA:
- Só use "salvar_nota" se o usuário pedir para lembrar, ou se for um aprendizado genérico (sem dados pessoais/segredos).
- Use "salvar_nota" proativamente para registrar fatos importantes do negócio.
- Evite sugerir "executar_shell" e "escrever_arquivo" a menos que o usuário peça explicitamente.
- Para automação em sites, prefira "pesquisar_web" + "navegar". Use "browser_run" apenas quando for necessário interagir (cliques/inputs) e respeite a allowlist de domínios.
- Seja analítica: explique hipóteses, métricas e o porquê das decisões (principalmente em marketing/finanças).

CONHECIMENTO SALVO (pode usar para responder melhor):
${conhecimento || "(vazio)"}

NÚCLEO DE IDENTIDADE (kiara_brain.md):
${brainContent || "(vazio)"}

MEMÓRIA RECENTE:
${memoria || "(vazia)"}

>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
${buildToolsPrompt()}
`.trim();
}

function normalizeActions(acoes) {
  if (!Array.isArray(acoes)) return [];
  return acoes
<<<<<<< HEAD
    .map((a) => ({ tipo: a?.tipo, dados: a?.dados ?? {} }))
    .filter((a) => typeof a.tipo === "string" && a.tipo.length);
}

function appendToolContext(current, results) {
  if (!Array.isArray(results) || !results.length) return current || "";
  const chunk = results.map((r) => `ACAO: ${r.tipo}\nOK: ${r.ok}\nRESULTADO:\n${r.result}`).join("\n\n");
  return [current, chunk].filter(Boolean).join("\n\n");
}

=======
    .map((a) => ({
      tipo: a?.tipo,
      dados: a?.dados ?? {},
    }))
    .filter((a) => typeof a.tipo === "string" && a.tipo.length);
}

>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
export async function runKiaraAgent({
  pergunta,
  perfil,
  alocacaoUrl,
  sessionId,
  workspaceId = "default",
  memoryStore,
  knowledgeStore,
  maxSteps = 4,
<<<<<<< HEAD
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

=======
  model = "mistral-small-latest",
  temperature = 0.6,
  baseDir,
  mistralKey,
}) {
  const safeBaseDir = baseDir || path.resolve(".");
  const memoria = memoryStore ? await memoryStore.getRelevant(workspaceId, pergunta) : "";
  const conhecimento = knowledgeStore ? await knowledgeStore.search(workspaceId, pergunta) : "";
  const agencyRef = await loadAgencyReference({ baseDir: safeBaseDir, perfil });
  
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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
<<<<<<< HEAD
    const system = buildSystemPrompt({
      memoria,
      conversaRecente,
      conhecimento,
      perfil,
      brainContent,
      providerName: llmConfig?.provider || (llmConfig?.ollamaBaseUrl ? "ollama" : "mistral"),
    });
=======
    const system = buildSystemPrompt({ memoria, conhecimento, perfil, brainContent });
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a

    const messages = [
      {
        role: "system",
<<<<<<< HEAD
        content: [system, agencyRef ? `\n\nREFERENCIA (agency-agents):\n${agencyRef}` : ""].filter(Boolean).join(""),
=======
        content: [
          system,
          agencyRef ? `\n\nREFERÊNCIA (agency-agents):\n${agencyRef}` : "",
        ]
          .filter(Boolean)
          .join(""),
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
      },
      {
        role: "user",
        content: [
<<<<<<< HEAD
          "TAREFA DO USUARIO:",
          String(pergunta),
          alocacaoUrl ? `\nSITE ALOCADO (contexto): ${alocacaoUrl}` : "",
          toolContext ? "\nCONTEXTO DE FERRAMENTAS (resultados anteriores):\n" + toolContext : "",
          lastText ? "\nSUA ULTIMA RESPOSTA (para continuar com consistencia):\n" + lastText : "",
=======
          "TAREFA DO USUÁRIO:",
          String(pergunta),
          alocacaoUrl ? `\nSITE ALOCADO (contexto): ${alocacaoUrl}` : "",
          toolContext ? "\nCONTEXTO DE FERRAMENTAS (resultados anteriores):\n" + toolContext : "",
          lastText ? "\nSUA ÚLTIMA RESPOSTA (para continuar com consistência):\n" + lastText : "",
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];

<<<<<<< HEAD
    let completion;
    try {
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
=======
    const { content, raw } = await mistralChatCompletions({
      apiKey: mistralKey,
      model,
      messages,
      temperature,
    });

    const parsed = extractJsonObject(content) || extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") {
      const err = new Error("Resposta inválida da IA (JSON)");
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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

<<<<<<< HEAD
    toolContext = appendToolContext(toolContext, results);
  }

  return {
    texto: lastText || "Conclui o maximo que consegui com as ferramentas disponiveis.",
=======
    toolContext = results
      .map((r) => `AÇÃO: ${r.tipo}\nOK: ${r.ok}\nRESULTADO:\n${r.result}`)
      .join("\n\n");
  }

  return {
    texto: lastText || "Concluí o máximo que consegui com as ferramentas disponíveis.",
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
    acoes: clientActions,
  };
}
