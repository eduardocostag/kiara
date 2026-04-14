import path from "path";
import { createLocalJsonlStore } from "./localStore.js";
import { extractSearchTerms, scoreTextMatch } from "./textSearch.js";

function sanitizeWorkspaceId(id) {
  const raw = String(id || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "default";
}

export function createMemoryStore({ redis, baseDir }) {
  function getLocal(workspaceId) {
    const wid = sanitizeWorkspaceId(workspaceId);
    return createLocalJsonlStore({
      baseDir: path.join(baseDir, "data", "workspaces", wid),
      filename: "memory.jsonl",
    });
  }

  function redisKey(workspaceId) {
    return `kiara_memory:${sanitizeWorkspaceId(workspaceId)}`;
  }

  async function saveTurn(workspaceId, pergunta, resposta) {
    const item = { pergunta: String(pergunta), resposta: String(resposta), time: Date.now() };

    if (redis) {
      try {
        const key = redisKey(workspaceId);
        await redis.lpush(key, JSON.stringify(item));
        await redis.ltrim(key, 0, 199);
        return;
      } catch {
        // fallback local
      }
    }

    const local = getLocal(workspaceId);
    await local.append(item);
  }

  async function loadItems(workspaceId, maxItems) {
    let items = [];

    if (redis) {
      try {
        const key = redisKey(workspaceId);
        const data = await redis.lrange(key, 0, maxItems);
        items = data
          .map((raw) => {
            try {
              return typeof raw === "string" ? JSON.parse(raw) : raw;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      } catch {
        items = [];
      }
    }

    if (!items.length) {
      const local = getLocal(workspaceId);
      items = await local.readAll({ maxLines: maxItems });
    }

    return items;
  }

  async function getRelevant(workspaceId, pergunta, { limit = 6 } = {}) {
    const keywords = extractSearchTerms(pergunta, { limit: 20 });
    const items = await loadItems(workspaceId, 800);

    return items
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
  }

  async function getRecent(workspaceId, { limit = 8 } = {}) {
    const items = await loadItems(workspaceId, Math.max(limit * 3, 24));

    return items
      .sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
      .slice(-limit)
      .map((m) => `Usuario: ${m.pergunta}\nKIARA: ${m.resposta}`)
      .join("\n\n");
  }

  function localFile(workspaceId) {
    const local = getLocal(workspaceId);
    return local.filePath;
  }

  return { saveTurn, getRelevant, getRecent, localFile };
}
