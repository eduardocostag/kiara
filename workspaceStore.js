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

  return { sanitizeWorkspaceId, getWorkspace, setWorkspace, listWorkspaces, root };
}

