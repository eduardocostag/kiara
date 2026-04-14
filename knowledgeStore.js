<<<<<<< HEAD
import fs from "fs/promises";
import path from "path";
import { createLocalJsonlStore } from "./localStore.js";
import { extractSearchTerms, scoreTextMatch } from "./textSearch.js";
=======
import path from "path";
import { createLocalJsonlStore } from "./localStore.js";

function scoreByKeywords(text, keywords) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return keywords.reduce((acc, k) => (lower.includes(k) ? acc + 1 : acc), 0);
}
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a

function sanitizeWorkspaceId(id) {
  const raw = String(id || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "default";
}

<<<<<<< HEAD
function classifyKnowledge(tags = [], text = "") {
  const bag = `${Array.isArray(tags) ? tags.join(" ") : ""} ${text}`.toLowerCase();
  if (/\b(financ|caixa|margem|lucro|receita|orcamento)\b/.test(bag)) return "finance";
  if (/\b(venda|comercial|lead|pipeline|proposta|fechamento)\b/.test(bag)) return "sales";
  if (/\b(marketing|copy|conteudo|trafego|seo|anuncio|meta ads|instagram)\b/.test(bag)) return "marketing";
  if (/\b(gestao|processo|operacao|roadmap|prioridade|backlog)\b/.test(bag)) return "management";
  if (/\b(api|automacao|arquitetura|backend|frontend|tecnologia|codigo|integracao)\b/.test(bag)) return "technology";
  if (/\b(preferencia|gosta|prefere|estilo|tom de voz)\b/.test(bag)) return "memory";
  return "business";
}

async function readTextFilesDeep(rootDir) {
  const docs = [];

  async function walk(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!/\.(md|txt|json)$/i.test(entry.name)) continue;
      try {
        const content = await fs.readFile(fullPath, "utf8");
        docs.push({
          path: fullPath,
          titulo: path.basename(entry.name),
          conteudo: content,
          tags: [path.basename(path.dirname(fullPath))],
          time: 0,
        });
      } catch {
        // ignore
      }
    }
  }

  await walk(rootDir);
  return docs;
}

export function createKnowledgeStore({ redis, baseDir }) {
  const globalKnowledgeRoot = path.join(baseDir, "data", "kiara", "knowledge");

=======
export function createKnowledgeStore({ redis, baseDir }) {
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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

<<<<<<< HEAD
  async function appendStructuredKnowledge(category, title, content, knowledgeType = "nota") {
    const safeCategory = classifyKnowledge([category], `${title}\n${content}`);
    const targetDir = path.join(globalKnowledgeRoot, safeCategory);
    const targetFile = path.join(
      targetDir,
      safeCategory === "memory"
        ? knowledgeType === "preferencia"
          ? "preferences.md"
          : "patterns.md"
        : `${safeCategory}_notes.md`,
    );
    const block = `\n\n## ${title}\n\nTipo: ${knowledgeType}\n\n${content.trim()}\n`;
    await fs.mkdir(targetDir, { recursive: true });
    await fs.appendFile(targetFile, block, "utf8");
  }

  async function addNote(workspaceId, { titulo, conteudo, tags = [], tipoConhecimento = "nota" }) {
    const title = String(titulo || "").slice(0, 200);
    const content = String(conteudo || "").slice(0, 50_000);
    const normalizedTags = Array.isArray(tags) ? tags.map(String).slice(0, 20) : [];

    const item = {
      tipo: "nota",
      tipoConhecimento: String(tipoConhecimento || "nota"),
      titulo: title,
      conteudo: content,
      tags: normalizedTags,
=======
  async function addNote(workspaceId, { titulo, conteudo, tags = [] }) {
    const item = {
      tipo: "nota",
      titulo: String(titulo || "").slice(0, 200),
      conteudo: String(conteudo || "").slice(0, 50_000),
      tags: Array.isArray(tags) ? tags.map(String).slice(0, 20) : [],
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
      time: Date.now(),
    };

    if (redis) {
      try {
        const key = redisKey(workspaceId);
        await redis.lpush(key, JSON.stringify(item));
        await redis.ltrim(key, 0, 799);
<<<<<<< HEAD
      } catch {
        // fallback local continues
=======
        return;
      } catch {
        // fallback local
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
      }
    }

    const local = getLocal(workspaceId);
    await local.append(item);
<<<<<<< HEAD

    try {
      await appendStructuredKnowledge(
        classifyKnowledge(normalizedTags, `${title}\n${content}`),
        title,
        content,
        String(tipoConhecimento || "nota"),
      );
    } catch {
      // structured knowledge is best-effort
    }
  }

  async function loadWorkspaceItems(workspaceId) {
=======
  }

  async function search(workspaceId, query, { limit = 6 } = {}) {
    const keywords = String(query).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 20);

>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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

<<<<<<< HEAD
    return items;
  }

  async function search(workspaceId, query, { limit = 8 } = {}) {
    const keywords = extractSearchTerms(query, { limit: 20 });
    const [workspaceItems, globalDocs] = await Promise.all([
      loadWorkspaceItems(workspaceId),
      readTextFilesDeep(globalKnowledgeRoot),
    ]);

    const combined = [...workspaceItems, ...globalDocs];

    const ranked = combined
      .map((k) => ({
        ...k,
        relevancia: scoreTextMatch(`${k.titulo} ${k.conteudo} ${(k.tags || []).join(" ")} ${k.path || ""}`, keywords, {
          recencyBoost: k.time ? 1 : 0,
          timestamp: k.time,
        }),
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .filter((k) => k.relevancia > 0)
      .slice(0, limit);
=======
    const ranked = items
      .map((k) => ({
        ...k,
        relevancia: scoreByKeywords(`${k.titulo} ${k.conteudo} ${(k.tags || []).join(" ")}`, keywords),
      }))
      .sort((a, b) => b.relevancia - a.relevancia)
      .slice(0, limit)
      .filter((k) => k.relevancia > 0);
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a

    return ranked
      .map((k) => {
        const tags = Array.isArray(k.tags) && k.tags.length ? `Tags: ${k.tags.join(", ")}` : "";
<<<<<<< HEAD
        const source = k.path ? `Fonte: ${path.relative(baseDir, k.path).replace(/\\/g, "/")}` : "";
        return [`NOTA: ${k.titulo}`, tags, source, k.conteudo].filter(Boolean).join("\n").trim();
=======
        return `NOTA: ${k.titulo}\n${tags}\n${k.conteudo}`.trim();
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
      })
      .join("\n\n");
  }

  function localFile(workspaceId) {
    const local = getLocal(workspaceId);
    return local.filePath;
  }

  return { addNote, search, localFile };
}
