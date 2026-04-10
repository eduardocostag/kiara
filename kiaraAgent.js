import path from "path";
import fs from "fs/promises";
import { buildToolsPrompt, CLIENT_ACTIONS, executeServerAction } from "./tools.js";
import { extractJsonObject } from "./json.js";
import { mistralChatCompletions } from "./mistral.js";
import { loadAgencyReference } from "./agencyReference.js";

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

${buildToolsPrompt()}
`.trim();
}

function normalizeActions(acoes) {
  if (!Array.isArray(acoes)) return [];
  return acoes
    .map((a) => ({
      tipo: a?.tipo,
      dados: a?.dados ?? {},
    }))
    .filter((a) => typeof a.tipo === "string" && a.tipo.length);
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
  model = "mistral-small-latest",
  temperature = 0.6,
  baseDir,
  mistralKey,
}) {
  const safeBaseDir = baseDir || path.resolve(".");
  const memoria = memoryStore ? await memoryStore.getRelevant(workspaceId, pergunta) : "";
  const conhecimento = knowledgeStore ? await knowledgeStore.search(workspaceId, pergunta) : "";
  const agencyRef = await loadAgencyReference({ baseDir: safeBaseDir, perfil });
  
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
    const system = buildSystemPrompt({ memoria, conhecimento, perfil, brainContent });

    const messages = [
      {
        role: "system",
        content: [
          system,
          agencyRef ? `\n\nREFERÊNCIA (agency-agents):\n${agencyRef}` : "",
        ]
          .filter(Boolean)
          .join(""),
      },
      {
        role: "user",
        content: [
          "TAREFA DO USUÁRIO:",
          String(pergunta),
          alocacaoUrl ? `\nSITE ALOCADO (contexto): ${alocacaoUrl}` : "",
          toolContext ? "\nCONTEXTO DE FERRAMENTAS (resultados anteriores):\n" + toolContext : "",
          lastText ? "\nSUA ÚLTIMA RESPOSTA (para continuar com consistência):\n" + lastText : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];

    const { content, raw } = await mistralChatCompletions({
      apiKey: mistralKey,
      model,
      messages,
      temperature,
    });

    const parsed = extractJsonObject(content) || extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") {
      const err = new Error("Resposta inválida da IA (JSON)");
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

    toolContext = results
      .map((r) => `AÇÃO: ${r.tipo}\nOK: ${r.ok}\nRESULTADO:\n${r.result}`)
      .join("\n\n");
  }

  return {
    texto: lastText || "Concluí o máximo que consegui com as ferramentas disponíveis.",
    acoes: clientActions,
  };
}
