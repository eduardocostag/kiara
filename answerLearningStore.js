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

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.:/-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function questionKey(question) {
  return normalizeText(question);
}

function looksReusableAnswer(answer) {
  const text = normalizeText(answer);
  if (!text || text.length < 12) return false;
  return !/\b(vou verificar|vou organizar|vou te devolver|recebi a tarefa|o usuario esta perguntando|ativei estes especialistas|como tenho um especialista)\b/.test(text);
}

function confidenceFromScore(score, successCount, overlapCount, reuseCount = 0) {
  const total = Number(successCount || 0) + Number(reuseCount || 0);
  if (score >= 8 || (total >= 3 && overlapCount >= 3)) return "alta";
  if (score >= 5 || (total >= 2 && overlapCount >= 2)) return "media";
  return "baixa";
}

function isCorrectionFollowUp(text) {
  const lower = normalizeText(text);
  return /\b(nao era isso|não era isso|ta errado|tá errado|errado|corrige|corrigir|nao respondeu|não respondeu|nao e isso|não é isso|resposta errada|isso esta errado|isso tá errado)\b/.test(lower);
}

function isPositiveFollowUp(text) {
  const lower = normalizeText(text);
  return /\b(ok|certo|valeu|obrigado|boa|perfeito|isso|funcionou|deu certo|entendi|sim)\b/.test(lower);
}

export function createAnswerLearningStore({ baseDir }) {
  const root = path.join(baseDir, "data", "workspaces");

  function filePath(workspaceId) {
    return path.join(root, sanitizeWorkspaceId(workspaceId), "learned_answers.json");
  }

  async function get(workspaceId) {
    return readJson(filePath(workspaceId), {
      workspaceId: sanitizeWorkspaceId(workspaceId),
      answers: [],
      pendingFeedback: null,
      updatedAt: Date.now(),
    });
  }

  async function learnFromAnswer(workspaceId, question, answer) {
    const normalizedQuestion = questionKey(question);
    const normalizedAnswer = String(answer || "").trim();
    if (!normalizedQuestion || !looksReusableAnswer(normalizedAnswer)) return null;

    const current = await get(workspaceId);
    const answers = Array.isArray(current.answers) ? current.answers : [];
    const now = Date.now();
    const terms = extractSearchTerms(`${question}\n${answer}`, { limit: 28 });
    const existing = answers.find((item) => item.key === normalizedQuestion);

    if (existing) {
      existing.answer = normalizedAnswer.slice(0, 4000);
      existing.successCount = Number(existing.successCount || 0) + 1;
      existing.lastUsedAt = now;
      existing.terms = [...new Set([...(existing.terms || []), ...terms])].slice(0, 32);
    } else {
      answers.push({
        key: normalizedQuestion,
        question: String(question || "").trim().slice(0, 280),
        answer: normalizedAnswer.slice(0, 4000),
        successCount: 1,
        reuseCount: 0,
        confirmationCount: 0,
        correctionCount: 0,
        lastUsedAt: now,
        terms,
        createdAt: now,
      });
    }

    const next = {
      workspaceId: sanitizeWorkspaceId(workspaceId),
      updatedAt: now,
      answers: answers
        .sort((a, b) => {
          const scoreA = Number(a.successCount || 0) + Number(a.reuseCount || 0);
          const scoreB = Number(b.successCount || 0) + Number(b.reuseCount || 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0);
        })
        .slice(0, 180),
    };
    await writeJson(filePath(workspaceId), next);
    return next;
  }

  async function setPendingFeedback(workspaceId, { question, answer }) {
    const current = await get(workspaceId);
    current.pendingFeedback = {
      key: questionKey(question),
      question: String(question || "").trim().slice(0, 280),
      answer: String(answer || "").trim().slice(0, 4000),
      time: Date.now(),
    };
    current.updatedAt = Date.now();
    await writeJson(filePath(workspaceId), current);
    return current;
  }

  async function registerUserFollowUp(workspaceId, userFollowUp) {
    const current = await get(workspaceId);
    const pending = current.pendingFeedback;
    if (!pending?.key) return current;

    const answers = Array.isArray(current.answers) ? current.answers : [];
    const item = answers.find((entry) => entry.key === pending.key);
    current.pendingFeedback = null;
    if (!item) {
      current.updatedAt = Date.now();
      await writeJson(filePath(workspaceId), current);
      return current;
    }

    const text = String(userFollowUp || "").trim();
    if (!text) {
      current.updatedAt = Date.now();
      await writeJson(filePath(workspaceId), current);
      return current;
    }

    if (isCorrectionFollowUp(text)) {
      item.correctionCount = Number(item.correctionCount || 0) + 1;
    } else if (isPositiveFollowUp(text) || questionKey(text) !== pending.key) {
      item.confirmationCount = Number(item.confirmationCount || 0) + 1;
      item.successCount = Number(item.successCount || 0) + 1;
    }

    item.lastUsedAt = Date.now();
    current.updatedAt = Date.now();
    await writeJson(filePath(workspaceId), current);
    return current;
  }

  async function markReuse(workspaceId, key) {
    const current = await get(workspaceId);
    const answers = Array.isArray(current.answers) ? current.answers : [];
    const item = answers.find((entry) => entry.key === key);
    if (!item) return current;
    item.reuseCount = Number(item.reuseCount || 0) + 1;
    item.lastUsedAt = Date.now();
    current.updatedAt = Date.now();
    await writeJson(filePath(workspaceId), current);
    return current;
  }

  async function findRelevant(workspaceId, question, { limit = 4, minScore = 2 } = {}) {
    const current = await get(workspaceId);
    const answers = Array.isArray(current.answers) ? current.answers : [];
    const normalized = normalizeText(question);
    const terms = extractSearchTerms(question, { limit: 20 });

    return answers
      .map((item) => {
        const haystack = normalizeText([item.question, item.answer, ...(item.terms || [])].join(" "));
        const overlapCount = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
        const exactBoost = item.key === normalized ? 4 : 0;
        const score = overlapCount + Math.min(Number(item.successCount || 0), 4) + Math.min(Number(item.reuseCount || 0), 3) + exactBoost;
        return {
          ...item,
          overlapCount,
          score,
          confidence: confidenceFromScore(score, item.successCount, overlapCount, item.reuseCount),
        };
      })
      .filter((item) => item.score >= minScore)
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
      .map((item, index) => `${index + 1}. ${item.question} | sucessos=${item.successCount} | reusos=${item.reuseCount || 0} | confirmacoes=${item.confirmationCount || 0} | correcoes=${item.correctionCount || 0} | confianca=${item.confidence}`)
      .join("\n");
  }

  return { get, learnFromAnswer, markReuse, setPendingFeedback, registerUserFollowUp, findRelevant, summarizeRelevant, filePath };
}
