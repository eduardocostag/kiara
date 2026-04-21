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

function simplifySequence(actions = []) {
  return (Array.isArray(actions) ? actions : []).map((action) => simplifyAction(action)).filter((action) => action.tipo);
}

function stableSequenceKey(actions = []) {
  return JSON.stringify(simplifySequence(actions));
}

function summarizeAction(action) {
  const tipo = String(action?.tipo || "");
  if (tipo === "abrir_site") return `abrir site ${action?.dados?.url || ""}`.trim();
  if (tipo === "pesquisa") return `pesquisar ${action?.dados?.query || ""}`.trim();
  if (tipo === "youtube_busca") return `buscar no youtube ${action?.dados?.query || ""}`.trim();
  if (tipo === "desktop_abrir_links") return "abrir varios links";
  if (tipo === "desktop_abrir_multiplos") return "abrir varios apps/sites";
  if (tipo === "desktop_abrir_janelas_browser") return `abrir ${action?.dados?.count || ""} janelas`.trim();
  if (tipo === "desktop_abrir_app") return `abrir app ${action?.dados?.app || ""}`.trim();
  if (tipo === "ver_tela") return "analisar tela";
  return tipo || "acao";
}

function summarizeSequence(actions = []) {
  const items = simplifySequence(actions).map((action) => summarizeAction(action));
  return items.join(" -> ").slice(0, 220) || "skill local";
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "skill-local";
}

function normalizeTrigger(question) {
  return String(question || "").trim().replace(/\s+/g, " ").slice(0, 140);
}

function confidenceFromSuccess(successCount, overlapCount, failureCount = 0) {
  const success = Number(successCount || 0);
  const overlap = Number(overlapCount || 0);
  const failure = Number(failureCount || 0);
  const balance = success - failure;
  if (failure >= Math.max(2, success) && success <= 1) return "baixa";
  if (success >= 4 || (balance >= 2 && overlap >= 3)) return "alta";
  if (success >= 2 || overlap >= 2) return "media";
  return "baixa";
}

function deriveSkillName(question, actions = []) {
  const terms = extractSearchTerms(question, { limit: 4 }).filter((term) => String(term || "").length >= 3);
  const actionSummary = summarizeSequence(actions);
  const readable = terms.length ? terms.join("-") : actionSummary;
  return slugify(readable);
}

function scoreSkill(skill, questionTerms = []) {
  const haystack = [
    skill?.summary,
    ...(skill?.terms || []),
    ...(skill?.triggers || []),
    skill?.lastQuestion,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const overlapCount = questionTerms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
  return {
    overlapCount,
    score: overlapCount + Math.min(Number(skill?.successCount || 0), 5),
  };
}

export function createSkillsStore({ baseDir }) {
  const root = path.join(baseDir, "data", "workspaces");

  function filePath(workspaceId) {
    return path.join(root, sanitizeWorkspaceId(workspaceId), "skills.json");
  }

  async function get(workspaceId) {
    return readJson(filePath(workspaceId), {
      workspaceId: sanitizeWorkspaceId(workspaceId),
      skills: [],
      updatedAt: Date.now(),
    });
  }

  async function learnFromExecution(workspaceId, question, results = []) {
    const current = await get(workspaceId);
    const skills = Array.isArray(current.skills) ? current.skills : [];
    const attempted = (Array.isArray(results) ? results : [])
      .filter((item) => item?.action?.tipo)
      .map((item) => ({ ok: Boolean(item.ok), action: simplifyAction(item.action), result: String(item.result || "") }));
    const successful = attempted.filter((item) => item.ok).map((item) => item.action);
    if (!attempted.length) return current;

    const now = Date.now();
    const attemptedActions = attempted.map((item) => item.action);
    const key = stableSequenceKey(attemptedActions);
    const terms = extractSearchTerms(question, { limit: 24 });
    const trigger = normalizeTrigger(question);
    const allSucceeded = attempted.length === successful.length && successful.length > 0;
    const existing = skills.find((item) => item.key === key);

    if (existing) {
      if (allSucceeded) {
        existing.successCount = Number(existing.successCount || 0) + 1;
        existing.lastUsedAt = now;
      } else {
        existing.failureCount = Number(existing.failureCount || 0) + 1;
        existing.lastFailureAt = now;
        existing.lastFailure = attempted
          .filter((item) => !item.ok)
          .map((item) => `${item.action.tipo}: ${item.result.slice(0, 180)}`)
          .join(" | ")
          .slice(0, 500);
      }
      existing.lastQuestion = trigger;
      existing.triggers = [...new Set([...(existing.triggers || []), trigger])].slice(0, 10);
      existing.terms = [...new Set([...(existing.terms || []), ...terms])].slice(0, 30);
      existing.actions = simplifySequence(attemptedActions);
      existing.summary = summarizeSequence(attemptedActions);
      if (!existing.name || /^skill-\d+$/.test(String(existing.name || ""))) {
        existing.name = deriveSkillName(question, attemptedActions);
      }
    } else if (allSucceeded) {
      skills.push({
        key,
        name: deriveSkillName(question, attemptedActions),
        summary: summarizeSequence(attemptedActions),
        triggers: [trigger],
        terms,
        actions: simplifySequence(attemptedActions),
        successCount: 1,
        failureCount: 0,
        source: "auto",
        lastQuestion: trigger,
        lastUsedAt: now,
        lastFailureAt: 0,
        lastFailure: "",
        createdAt: now,
      });
    }

    const next = {
      workspaceId: sanitizeWorkspaceId(workspaceId),
      updatedAt: now,
      skills: skills
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

  async function findRelevant(workspaceId, question, { limit = 4, minScore = 2 } = {}) {
    const current = await get(workspaceId);
    const skills = Array.isArray(current.skills) ? current.skills : [];
    const terms = extractSearchTerms(question, { limit: 20 });

    return skills
      .map((skill) => {
        const { overlapCount, score } = scoreSkill(skill, terms);
        return {
          ...skill,
          overlapCount,
          score,
          confidence: confidenceFromSuccess(skill.successCount, overlapCount, skill.failureCount),
        };
      })
      .filter((skill) => skill.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0);
      })
      .slice(0, limit);
  }

  async function summarizeRelevant(workspaceId, question, { limit = 4 } = {}) {
    const items = await findRelevant(workspaceId, question, { limit, minScore: 1 });
    if (!items.length) return "";
    return items
      .map((item, index) => `${index + 1}. ${item.name || "skill-local"} | ${item.summary} | sucessos=${item.successCount} | falhas=${item.failureCount || 0} | confianca=${item.confidence}`)
      .join("\n");
  }

  return { get, learnFromExecution, findRelevant, summarizeRelevant, filePath };
}
