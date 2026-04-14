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

export function createMissionStore({ baseDir }) {
  const root = path.join(baseDir, "data", "workspaces");

  function filePath(workspaceId) {
    return path.join(root, sanitizeWorkspaceId(workspaceId), "missions.json");
  }

  async function list(workspaceId) {
    return readJson(filePath(workspaceId), { missions: [] });
  }

  async function upsert(workspaceId, mission) {
    const current = await list(workspaceId);
    const missions = Array.isArray(current.missions) ? current.missions : [];
    const id = String(mission.id || mission.title || Date.now());
    const nextMission = {
      id,
      title: mission.title || id,
      status: mission.status || "open",
      nextStep: mission.nextStep || "",
      summary: mission.summary || "",
      updatedAt: Date.now(),
      createdAt: mission.createdAt || Date.now(),
    };

    const next = missions.filter((item) => String(item.id) !== id);
    next.unshift(nextMission);
    await writeJson(filePath(workspaceId), { missions: next.slice(0, 20) });
    return nextMission;
  }

  async function close(workspaceId, id, patch = {}) {
    const current = await list(workspaceId);
    const missions = (current.missions || []).map((mission) =>
      String(mission.id) === String(id)
        ? { ...mission, ...patch, status: "done", updatedAt: Date.now() }
        : mission,
    );
    await writeJson(filePath(workspaceId), { missions });
  }

  function format(missionsData) {
    const missions = missionsData?.missions || [];
    if (!missions.length) return "";
    return missions
      .slice(0, 6)
      .map(
        (mission, index) =>
          `${index + 1}. ${mission.title}\n   Status: ${mission.status}\n   Proximo passo: ${mission.nextStep || "(nao definido)"}\n   Resumo: ${mission.summary || "(sem resumo)"}`,
      )
      .join("\n\n");
  }

  return { list, upsert, close, format, filePath };
}
