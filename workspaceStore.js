import fs from "fs/promises";
import path from "path";

function sanitizeWorkspaceId(id) {
  const raw = String(id || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "default";
}

async function readJson(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function createWorkspaceStore({ baseDir }) {
  const root = path.join(baseDir, "data", "workspaces");
  const indexPath = path.join(root, "index.json");
  const globalPlaybooksRoot = path.join(baseDir, "data", "kiara", "playbooks");

  async function ensureWorkspace(workspaceId) {
    const id = sanitizeWorkspaceId(workspaceId);
    const idx = await readJson(indexPath, { workspaces: {} });
    if (!idx.workspaces[id]) {
      idx.workspaces[id] = { createdAt: Date.now() };
      await writeJson(indexPath, idx);
    }
    await fs.mkdir(path.join(root, id), { recursive: true });
    return id;
  }

  async function getWorkspace(workspaceId) {
    const id = await ensureWorkspace(workspaceId);
    const cfgPath = path.join(root, id, "config.json");
    const cfg = await readJson(cfgPath, {
      workspaceId: id,
      nome: id,
      metas: [],
      preferencias: {},
      alocacaoUrl: null,
      updatedAt: Date.now(),
    });
    return { ...cfg, workspaceId: id };
  }

  async function setWorkspace(workspaceId, patch) {
    const id = await ensureWorkspace(workspaceId);
    const cfgPath = path.join(root, id, "config.json");
    const current = await getWorkspace(id);
    const next = {
      ...current,
      ...patch,
      workspaceId: id,
      updatedAt: Date.now(),
    };
    await writeJson(cfgPath, next);
    return next;
  }

  async function listWorkspaces() {
    const idx = await readJson(indexPath, { workspaces: {} });
    return Object.keys(idx.workspaces || {}).sort();
  }

  function automationDir(workspaceId) {
    return path.join(root, sanitizeWorkspaceId(workspaceId), "automations");
  }

  async function readAutomationCollection(dir, source) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const automations = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
      const filePath = path.join(dir, entry.name);
      const item = await readJson(filePath, null);
      if (!item || typeof item !== "object") continue;
      automations.push({
        ...item,
        slug: path.basename(entry.name, ".json"),
        filePath,
        source,
      });
    }

    return automations;
  }

  async function listAutomations(workspaceId) {
    const [workspaceAutomations, globalPlaybooks] = await Promise.all([
      readAutomationCollection(automationDir(workspaceId), "workspace"),
      readAutomationCollection(globalPlaybooksRoot, "global"),
    ]);

    return [...workspaceAutomations, ...globalPlaybooks].sort((a, b) => {
      const scoreA = a.source === "workspace" ? 1 : 0;
      const scoreB = b.source === "workspace" ? 1 : 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const aTime = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
      const bTime = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
      return bTime - aTime;
    });
  }

  async function getRelevantAutomations(workspaceId, query, { limit = 4 } = {}) {
    const automations = await listAutomations(workspaceId);
    const terms = String(query || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((item) => item && item.length >= 3);

    const scored = automations
      .map((item) => {
        const haystack = [
          item.slug,
          item.nome,
          item.objetivo,
          item.url,
          Array.isArray(item.passos) ? item.passos.join(" ") : "",
          Array.isArray(item.tags) ? item.tags.join(" ") : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const score = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
        return { ...item, score };
      })
      .filter((item) => item.score > 0 || !terms.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  return {
    sanitizeWorkspaceId,
    getWorkspace,
    setWorkspace,
    listWorkspaces,
    listAutomations,
    getRelevantAutomations,
    root,
  };
}
