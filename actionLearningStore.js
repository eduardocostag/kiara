import fs from "fs/promises";
import path from "path";
import { extractSearchTerms } from "./textSearch.js";

function sanitizeWorkspaceId(id) {
  const raw = String(id || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "default";
}

async function readJson(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function simplifyAction(action) {
  const tipo = String(action?.tipo || "").trim();
  const dados = action?.dados && typeof action.dados === "object" ? action.dados : {};
  return { tipo, dados };
}

function stableActionKey(action) {
  const normalized = simplifyAction(action);
  return JSON.stringify(normalized);
}

function simplifyActionSequence(actions = []) {
  return (Array.isArray(actions) ? actions : []).map((action) => simplifyAction(action)).filter((action) => action.tipo);
}

function stableSequenceKey(actions = []) {
  return JSON.stringify(simplifyActionSequence(actions));
}

function summarizeAction(action) {
  const tipo = String(action?.tipo || "");
  if (tipo === "desktop_abrir_app") return `abrir app ${action?.dados?.app || ""}`.trim();
  if (tipo === "desktop_abrir_caminho") return `abrir caminho ${action?.dados?.path || ""}`.trim();
  if (tipo === "desktop_copiar_texto") return "copiar texto";
  if (tipo === "desktop_enviar_teclas") return `enviar teclas ${action?.dados?.keys || ""}`.trim();
  if (tipo === "ver_tela") return "analisar tela";
  if (tipo === "browser_run") return `automatizar navegador ${action?.dados?.url || ""}`.trim();
  return tipo || "acao";
}

function summarizeSequence(actions = []) {
  const items = simplifyActionSequence(actions).map((action) => summarizeAction(action));
  if (!items.length) return "sequencia";
  return items.join(" -> ").slice(0, 220);
}

function confidenceFromScore(score, successCount, overlapCount, failureCount = 0) {
  const numericScore = Number(score || 0);
  const numericSuccess = Number(successCount || 0);
  const numericOverlap = Number(overlapCount || 0);
  const numericFailure = Number(failureCount || 0);
  const balance = numericSuccess - numericFailure;

  if (numericFailure >= Math.max(2, numericSuccess) && numericSuccess <= 1) return "baixa";
  if (numericScore >= 8 || (balance >= 4 && numericOverlap >= 3)) return "alta";
  if (numericScore >= 5 || (balance >= 2 && numericOverlap >= 2)) return "media";
  return "baixa";
}

function mergeTerms(question, action, result) {
  const base = extractSearchTerms(
    [question, action?.tipo, action?.dados?.app, action?.dados?.path, action?.dados?.url, result].filter(Boolean).join("\n"),
    { limit: 24 },
  );
  return [...new Set(base)].slice(0, 24);
}

export function createActionLearningStore({ baseDir }) {
  const root = path.join(baseDir, "data", "workspaces");

  function filePath(workspaceId) {
    return path.join(root, sanitizeWorkspaceId(workspaceId), "learned_actions.json");
  }

  async function get(workspaceId) {
    return readJson(filePath(workspaceId), {
      workspaceId: sanitizeWorkspaceId(workspaceId),
      patterns: [],
      sequences: [],
      updatedAt: Date.now(),
    });
  }

  async function learnFromExecution(workspaceId, question, executed = []) {
    const current = await get(workspaceId);
    const patterns = Array.isArray(current.patterns) ? current.patterns : [];
    const sequences = Array.isArray(current.sequences) ? current.sequences : [];
    const now = Date.now();
    const successfulActions = [];
    const attemptedActions = [];

    for (const item of executed) {
      if (!item?.action?.tipo) continue;
      const action = simplifyAction(item.action);
      attemptedActions.push(action);
      const key = stableActionKey(action);
      const terms = mergeTerms(question, action, item.result);
      const existing = patterns.find((pattern) => pattern.key === key);

      if (existing) {
        if (item.ok) {
          existing.successCount = Number(existing.successCount || 0) + 1;
          existing.lastUsedAt = now;
          existing.lastResult = String(item.result || "").slice(0, 500);
        } else {
          existing.failureCount = Number(existing.failureCount || 0) + 1;
          existing.lastFailureAt = now;
          existing.lastFailure = String(item.result || "").slice(0, 500);
        }
        existing.lastQuestion = String(question || "").slice(0, 300);
        existing.terms = [...new Set([...(existing.terms || []), ...terms])].slice(0, 30);
      } else {
        patterns.push({
          key,
          action,
          summary: summarizeAction(action),
          successCount: item.ok ? 1 : 0,
          failureCount: item.ok ? 0 : 1,
          lastUsedAt: item.ok ? now : 0,
          lastFailureAt: item.ok ? 0 : now,
          lastQuestion: String(question || "").slice(0, 300),
          lastResult: item.ok ? String(item.result || "").slice(0, 500) : "",
          lastFailure: item.ok ? "" : String(item.result || "").slice(0, 500),
          terms,
          createdAt: now,
        });
      }

      if (item.ok) successfulActions.push(action);
    }

    if (attemptedActions.length >= 2) {
      const sequenceKey = stableSequenceKey(attemptedActions);
      const sequenceTerms = extractSearchTerms(
        [question, ...attemptedActions.map((action) => `${action.tipo} ${JSON.stringify(action.dados || {})}`)].join("\n"),
        { limit: 30 },
      );
      const existingSequence = sequences.find((sequence) => sequence.key === sequenceKey);
      const allSucceeded = attemptedActions.length === successfulActions.length && successfulActions.length >= 2;

      if (existingSequence) {
        if (allSucceeded) {
          existingSequence.successCount = Number(existingSequence.successCount || 0) + 1;
          existingSequence.lastUsedAt = now;
          existingSequence.lastResult = summarizeSequence(successfulActions);
        } else {
          existingSequence.failureCount = Number(existingSequence.failureCount || 0) + 1;
          existingSequence.lastFailureAt = now;
          existingSequence.lastFailure = (Array.isArray(executed) ? executed : [])
            .filter((item) => item && item.ok === false)
            .map((item) => `${item.tipo}: ${String(item.result || "").slice(0, 180)}`)
            .join(" | ")
            .slice(0, 500);
        }
        existingSequence.lastQuestion = String(question || "").slice(0, 300);
        existingSequence.terms = [...new Set([...(existingSequence.terms || []), ...sequenceTerms])].slice(0, 36);
      } else if (allSucceeded) {
        sequences.push({
          key: sequenceKey,
          actions: attemptedActions,
          summary: summarizeSequence(attemptedActions),
          successCount: 1,
          failureCount: 0,
          lastUsedAt: now,
          lastFailureAt: 0,
          lastQuestion: String(question || "").slice(0, 300),
          terms: sequenceTerms,
          lastResult: summarizeSequence(successfulActions),
          lastFailure: "",
          createdAt: now,
        });
      }
    }

    const next = {
      workspaceId: sanitizeWorkspaceId(workspaceId),
      updatedAt: now,
      patterns: patterns
        .sort((a, b) => {
          const scoreA = Number(a.successCount || 0) - Number(a.failureCount || 0);
          const scoreB = Number(b.successCount || 0) - Number(b.failureCount || 0);
          if (scoreB !== scoreA) {
            return scoreB - scoreA;
          }
          return Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0);
        })
        .slice(0, 120),
      sequences: sequences
        .sort((a, b) => {
          const scoreA = Number(a.successCount || 0) - Number(a.failureCount || 0);
          const scoreB = Number(b.successCount || 0) - Number(b.failureCount || 0);
          if (scoreB !== scoreA) {
            return scoreB - scoreA;
          }
          return Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0);
        })
        .slice(0, 80),
    };

    await writeJson(filePath(workspaceId), next);
    return next;
  }

  async function findRelevant(workspaceId, question, { limit = 5, minScore = 2 } = {}) {
    const current = await get(workspaceId);
    const patterns = Array.isArray(current.patterns) ? current.patterns : [];
    const terms = extractSearchTerms(question, { limit: 20 });

    return patterns
      .map((pattern) => {
        const haystack = `${pattern.summary || ""} ${(pattern.terms || []).join(" ")} ${pattern.lastQuestion || ""}`.toLowerCase();
        const overlapCount = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
        const score = overlapCount + Math.min(Number(pattern.successCount || 0), 4);
        return {
          ...pattern,
          score,
          overlapCount,
          confidence: confidenceFromScore(score, pattern.successCount, overlapCount, pattern.failureCount),
        };
      })
      .filter((pattern) => pattern.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0);
      })
      .slice(0, limit);
  }

  async function findRelevantSequences(workspaceId, question, { limit = 3, minScore = 3 } = {}) {
    const current = await get(workspaceId);
    const sequences = Array.isArray(current.sequences) ? current.sequences : [];
    const terms = extractSearchTerms(question, { limit: 20 });

    return sequences
      .map((sequence) => {
        const haystack = `${sequence.summary || ""} ${(sequence.terms || []).join(" ")} ${sequence.lastQuestion || ""}`.toLowerCase();
        const overlapCount = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
        const score = overlapCount + Math.min(Number(sequence.successCount || 0), 4);
        return {
          ...sequence,
          score,
          overlapCount,
          confidence: confidenceFromScore(score, sequence.successCount, overlapCount, sequence.failureCount),
        };
      })
      .filter((sequence) => sequence.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0);
      })
      .slice(0, limit);
  }

  async function summarizeRelevant(workspaceId, question, { limit = 4 } = {}) {
    const [items, sequenceItems] = await Promise.all([
      findRelevant(workspaceId, question, { limit, minScore: 1 }),
      findRelevantSequences(workspaceId, question, { limit: Math.max(2, Math.ceil(limit / 2)), minScore: 2 }),
    ]);
    const merged = [
      ...sequenceItems.map((item) => ({ ...item, kind: "sequencia" })),
      ...items.map((item) => ({ ...item, kind: "acao" })),
    ].slice(0, limit);
    if (!merged.length) return "";
    return merged
      .map((item, index) => `${index + 1}. [${item.kind}] ${item.summary} | sucessos=${item.successCount} | confianca=${item.confidence || "baixa"}`)
      .join("\n");
  }

  async function summarizeWorkspace(workspaceId, { limitPatterns = 8, limitSequences = 6 } = {}) {
    const current = await get(workspaceId);
    const patterns = (current.patterns || []).slice(0, limitPatterns);
    const sequences = (current.sequences || []).slice(0, limitSequences);

    return [
      `Workspace: ${current.workspaceId}`,
      "",
      "Acoes aprendidas:",
      patterns.length
        ? patterns.map((item, index) => `${index + 1}. ${item.summary} | sucessos=${item.successCount} | falhas=${item.failureCount || 0}`).join("\n")
        : "(nenhuma)",
      "",
      "Rotinas aprendidas:",
      sequences.length
        ? sequences.map((item, index) => `${index + 1}. ${item.summary} | sucessos=${item.successCount} | falhas=${item.failureCount || 0}`).join("\n")
        : "(nenhuma)",
    ].join("\n");
  }

  return { get, learnFromExecution, findRelevant, findRelevantSequences, summarizeRelevant, summarizeWorkspace, filePath };
}
