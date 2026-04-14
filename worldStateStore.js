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
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function createWorldStateStore({ baseDir }) {
  const root = path.join(baseDir, "data", "workspaces");

  function filePath(workspaceId) {
    return path.join(root, sanitizeWorkspaceId(workspaceId), "world_state.json");
  }

  async function get(workspaceId) {
    return readJson(filePath(workspaceId), {
      workspaceId: sanitizeWorkspaceId(workspaceId),
      status: "idle",
      currentFocus: "",
      activeGoals: [],
      openLoops: [],
      recentActions: [],
      recentFindings: [],
      updatedAt: Date.now(),
    });
  }

  async function set(workspaceId, patch) {
    const current = await get(workspaceId);
    const next = {
      ...current,
      ...patch,
      workspaceId: sanitizeWorkspaceId(workspaceId),
      updatedAt: Date.now(),
    };
    await writeJson(filePath(workspaceId), next);
    return next;
  }

  async function pushAction(workspaceId, actionSummary) {
    const current = await get(workspaceId);
    const nextActions = [...(current.recentActions || []), actionSummary].slice(-12);
    return set(workspaceId, { recentActions: nextActions });
  }

  async function pushFinding(workspaceId, finding) {
    const current = await get(workspaceId);
    const nextFindings = [...(current.recentFindings || []), finding].slice(-12);
    return set(workspaceId, { recentFindings: nextFindings });
  }

  return { get, set, pushAction, pushFinding, filePath };
}
