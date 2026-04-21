import path from "path";
import { createLocalJsonlStore } from "./localStore.js";
import { extractSearchTerms, scoreTextMatch } from "./textSearch.js";

function sanitizeWorkspaceId(id) {
  const raw = String(id || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "default";
}

export function createMemoryStore({ redis, baseDir }) {
  async function withRedisTimeout(task, fallback, timeoutMs = 1200) {
    if (!redis) return fallback;
    try {
      return await Promise.race([
        task(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("redis-timeout")), timeoutMs)),
      ]);
    } catch {
      return fallback;
    }
  }

  function getLocal(workspaceId) {
    const wid = sanitizeWorkspaceId(workspaceId);
    return createLocalJsonlStore({
      baseDir: path.join(baseDir, "data", "workspaces", wid),
      filename: "memory.jsonl",
    });
  }

  function getFactsLocal(workspaceId) {
    const wid = sanitizeWorkspaceId(workspaceId);
    return createLocalJsonlStore({
      baseDir: path.join(baseDir, "data", "workspaces", wid),
      filename: "memory_facts.jsonl",
    });
  }

  function redisKey(workspaceId) {
    return `kiara_memory:${sanitizeWorkspaceId(workspaceId)}`;
  }

  function factsRedisKey(workspaceId) {
    return `kiara_memory_facts:${sanitizeWorkspaceId(workspaceId)}`;
  }

  function normalizeFactText(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s:-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractPersistentFacts(pergunta) {
    const text = String(pergunta || "").trim();
    const lower = text.toLowerCase();
    const facts = [];

    const pushFact = (kind, content) => {
      const normalized = String(content || "").trim();
      if (!normalized) return;
      facts.push({
        kind,
        content: normalized,
        normalized: normalizeFactText(normalized),
        time: Date.now(),
        sourceQuestion: text,
      });
    };

    const nameMatch = text.match(/\b(meu nome e|me chamo|pode me chamar de)\s+(.+)$/i);
    if (nameMatch?.[2]) {
      pushFact("identidade", `Nome preferido do usuario: ${nameMatch[2].trim()}`);
    }

    if (/\b(prefiro|eu prefiro|quero que voce|gosto de|nao gosto de|odeio|sempre|nunca)\b/i.test(text)) {
      pushFact("preferencia", text);
    }

    const workMatch = text.match(/\b(eu trabalho com|trabalho com|atuo com|sou)\s+(.+)$/i);
    if (workMatch?.[2]) {
      pushFact("perfil", `Contexto profissional: ${workMatch[2].trim()}`);
    }

    const projectMatch = text.match(/\b(meu projeto|estou criando|estou construindo|estou desenvolvendo|quero criar)\s+(.+)$/i);
    if (projectMatch?.[2]) {
      pushFact("projeto", `Projeto ou objetivo atual: ${projectMatch[2].trim()}`);
    }

    if (/\b(lembre|guarde|anota|anote|nao esqueca|isso e importante)\b/i.test(lower)) {
      pushFact("lembrete", text);
    }

    return facts.filter((item) => item.normalized.length >= 12);
  }

  async function loadFacts(workspaceId, maxItems = 200) {
    let items = [];

    if (redis) {
      const key = factsRedisKey(workspaceId);
      items = await withRedisTimeout(async () => {
        const data = await redis.lrange(key, 0, maxItems);
        return data
          .map((raw) => {
            try {
              return typeof raw === "string" ? JSON.parse(raw) : raw;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      }, []);
    }

    if (!items.length) {
      const local = getFactsLocal(workspaceId);
      items = await local.readAll({ maxLines: maxItems });
    }

    return items;
  }

  async function saveFacts(workspaceId, facts) {
    const entries = Array.isArray(facts) ? facts.filter(Boolean) : [];
    if (!entries.length) return;

    const existing = await loadFacts(workspaceId, 400);
    const known = new Set(existing.map((item) => String(item.normalized || "")));
    const newEntries = entries.filter((item) => item.normalized && !known.has(item.normalized));
    if (!newEntries.length) return;

    if (redis) {
      const key = factsRedisKey(workspaceId);
      await withRedisTimeout(async () => {
        for (const item of newEntries) {
          await redis.lpush(key, JSON.stringify(item));
        }
        await redis.ltrim(key, 0, 199);
        return true;
      }, false);
    }

    const local = getFactsLocal(workspaceId);
    for (const item of newEntries) {
      await local.append(item);
    }
  }

  async function saveTurn(workspaceId, pergunta, resposta) {
    const item = { pergunta: String(pergunta), resposta: String(resposta), time: Date.now() };

    if (redis) {
      const key = redisKey(workspaceId);
      const savedInRedis = await withRedisTimeout(async () => {
        await redis.lpush(key, JSON.stringify(item));
        await redis.ltrim(key, 0, 199);
        return true;
      }, false);
      if (savedInRedis) return;
    }

    const local = getLocal(workspaceId);
    await local.append(item);

    const facts = extractPersistentFacts(pergunta);
    if (facts.length) {
      await saveFacts(workspaceId, facts);
    }
  }

  async function loadItems(workspaceId, maxItems) {
    let items = [];

    if (redis) {
      const key = redisKey(workspaceId);
      items = await withRedisTimeout(async () => {
        const data = await redis.lrange(key, 0, maxItems);
        return data
          .map((raw) => {
            try {
              return typeof raw === "string" ? JSON.parse(raw) : raw;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      }, []);
    }

    if (!items.length) {
      const local = getLocal(workspaceId);
      items = await local.readAll({ maxLines: maxItems });
    }

    return items;
  }

  async function getRelevant(workspaceId, pergunta, { limit = 6 } = {}) {
    const keywords = extractSearchTerms(pergunta, { limit: 20 });
    const [items, facts] = await Promise.all([
      loadItems(workspaceId, 800),
      loadFacts(workspaceId, 200),
    ]);

    const turnText = items
      .map((m) => ({
        ...m,
        relevancia: scoreTextMatch(`${m.pergunta} ${m.resposta}`, keywords, {
          recencyBoost: 2,
          timestamp: m.time,
        }),
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .filter((m) => m.relevancia > 0)
      .slice(0, limit)
      .map((m) => `Usuario: ${m.pergunta}\nKIARA: ${m.resposta}`)
      .join("\n\n");

    const factText = facts
      .map((fact) => ({
        ...fact,
        relevancia: scoreTextMatch(`${fact.kind} ${fact.content}`, keywords, {
          recencyBoost: 1,
          timestamp: fact.time,
        }) + (/preferencia|identidade|perfil|projeto/.test(String(fact.kind || "")) ? 2 : 0),
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .filter((fact) => fact.relevancia > 0)
      .slice(0, Math.max(2, Math.ceil(limit / 2)))
      .map((fact) => `MEMORIA ${String(fact.kind || "fato").toUpperCase()}: ${fact.content}`)
      .join("\n");

    return [factText, turnText].filter(Boolean).join("\n\n");
  }

  async function getRecent(workspaceId, { limit = 8 } = {}) {
    const items = await loadItems(workspaceId, Math.max(limit * 3, 24));

    return items
      .sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
      .slice(-limit)
      .map((m) => `Usuario: ${m.pergunta}\nKIARA: ${m.resposta}`)
      .join("\n\n");
  }

  async function getProfile(workspaceId, { limit = 10 } = {}) {
    const facts = await loadFacts(workspaceId, 200);
    return facts
      .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
      .slice(0, limit)
      .map((fact) => `- [${String(fact.kind || "fato")}] ${fact.content}`)
      .join("\n");
  }

  function localFile(workspaceId) {
    const local = getLocal(workspaceId);
    return local.filePath;
  }

  function factsLocalFile(workspaceId) {
    const local = getFactsLocal(workspaceId);
    return local.filePath;
  }

  return { saveTurn, getRelevant, getRecent, getProfile, localFile, factsLocalFile };
}
