import path from "path";
import { createLocalJsonlStore } from "./localStore.js";

function sanitizeWorkspaceId(id) {
  const raw = String(id || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "default";
}

function scoreByKeywords(text, keywords) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return keywords.reduce((acc, k) => (lower.includes(k) ? acc + 1 : acc), 0);
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

  async function getRelevant(workspaceId, pergunta, { limit = 6 } = {}) {
    const keywords = String(pergunta).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 20);

    let items = [];
    if (redis) {
      try {
        const key = redisKey(workspaceId);
        const data = await redis.lrange(key, 0, 240);
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
      items = await local.readAll({ maxLines: 800 });
    }

    return items
      .map((m) => ({
        ...m,
        relevancia: scoreByKeywords(`${m.pergunta} ${m.resposta}`, keywords),
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .slice(0, limit)
      .map((m) => `Usuário: ${m.pergunta}\nKIARA: ${m.resposta}`)
      .join("\n\n");
  }

  function localFile(workspaceId) {
    const local = getLocal(workspaceId);
    return local.filePath;
  }

  return { saveTurn, getRelevant, localFile };
}
