import path from "path";
import { createLocalJsonlStore } from "./localStore.js";

function scoreByKeywords(text, keywords) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return keywords.reduce((acc, k) => (lower.includes(k) ? acc + 1 : acc), 0);
}

function sanitizeWorkspaceId(id) {
  const raw = String(id || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "default";
}

export function createKnowledgeStore({ redis, baseDir }) {
  function getLocal(workspaceId) {
    const wid = sanitizeWorkspaceId(workspaceId);
    return createLocalJsonlStore({
      baseDir: path.join(baseDir, "data", "workspaces", wid),
      filename: "knowledge.jsonl",
    });
  }

  function redisKey(workspaceId) {
    return `kiara_knowledge:${sanitizeWorkspaceId(workspaceId)}`;
  }

  async function addNote(workspaceId, { titulo, conteudo, tags = [] }) {
    const item = {
      tipo: "nota",
      titulo: String(titulo || "").slice(0, 200),
      conteudo: String(conteudo || "").slice(0, 50_000),
      tags: Array.isArray(tags) ? tags.map(String).slice(0, 20) : [],
      time: Date.now(),
    };

    if (redis) {
      try {
        const key = redisKey(workspaceId);
        await redis.lpush(key, JSON.stringify(item));
        await redis.ltrim(key, 0, 799);
        return;
      } catch {
        // fallback local
      }
    }

    const local = getLocal(workspaceId);
    await local.append(item);
  }

  async function search(workspaceId, query, { limit = 6 } = {}) {
    const keywords = String(query).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 20);

    let items = [];
    if (redis) {
      try {
        const key = redisKey(workspaceId);
        const data = await redis.lrange(key, 0, 900);
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
      items = await local.readAll({ maxLines: 1200 });
    }

    const ranked = items
      .map((k) => ({
        ...k,
        relevancia: scoreByKeywords(`${k.titulo} ${k.conteudo} ${(k.tags || []).join(" ")}`, keywords),
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .slice(0, limit)
      .filter((k) => k.relevancia > 0);

    return ranked
      .map((k) => {
        const tags = Array.isArray(k.tags) && k.tags.length ? `Tags: ${k.tags.join(", ")}` : "";
        return `NOTA: ${k.titulo}\n${tags}\n${k.conteudo}`.trim();
      })
      .join("\n\n");
  }

  function localFile(workspaceId) {
    const local = getLocal(workspaceId);
    return local.filePath;
  }

  return { addNote, search, localFile };
}
