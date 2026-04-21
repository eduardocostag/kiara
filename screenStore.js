function getMap() {
  if (!globalThis.__KIARA_SCREEN_STORE) {
    globalThis.__KIARA_SCREEN_STORE = new Map();
  }
  return globalThis.__KIARA_SCREEN_STORE;
}

function getSessionState(sessionId) {
  const map = getMap();
  const id = String(sessionId);
  if (!map.has(id)) {
    map.set(id, {
      latest: null,
      firstTs: 0,
      totalFrames: 0,
      recentFrames: [],
      observations: [],
      analysisCache: [],
      liveSummary: {
        currentFocus: "",
        currentApp: "",
        recentChanges: [],
        recentInsights: [],
        updatedAt: 0,
      },
    });
  }
  return map.get(id);
}

function frameSignature(imageBase64Jpeg) {
  const text = String(imageBase64Jpeg || "");
  if (!text) return "empty";
  return `${text.length}:${text.slice(0, 48)}:${text.slice(-48)}`;
}

export function putScreenFrame(sessionId, frame) {
  const state = getSessionState(sessionId);
  const now = Date.now();
  const nextFrame = {
    ...frame,
    ts: now,
    signature: frameSignature(frame?.imageBase64Jpeg),
  };

  state.latest = nextFrame;
  state.firstTs = state.firstTs || now;
  state.totalFrames = Number(state.totalFrames || 0) + 1;
  state.recentFrames = [...(state.recentFrames || []), {
    ts: nextFrame.ts,
    w: nextFrame.w || null,
    h: nextFrame.h || null,
    signature: nextFrame.signature,
  }].slice(-8);
}

export function getScreenFrame(sessionId) {
  const state = getSessionState(sessionId);
  return state.latest || null;
}

export function hasScreenFrame(sessionId, maxAgeMs = 12_000) {
  const frame = getScreenFrame(sessionId);
  if (!frame?.ts) return false;
  return Date.now() - Number(frame.ts || 0) <= maxAgeMs;
}

export function getScreenFrameSummary(sessionId, maxAgeMs = 12_000) {
  const state = getSessionState(sessionId);
  const frame = state.latest;
  if (!frame?.ts) return null;
  const ageMs = Date.now() - Number(frame.ts || 0);
  if (ageMs > maxAgeMs) return null;

  const recentFrames = Array.isArray(state.recentFrames) ? state.recentFrames : [];
  const recentSignatures = [...new Set(recentFrames.map((item) => item.signature).filter(Boolean))];
  const changedInRecentFrames = recentSignatures.length > 1;

  return {
    ts: frame.ts,
    ageMs,
    w: frame.w || null,
    h: frame.h || null,
    totalFrames: Number(state.totalFrames || 0),
    activeForMs: state.firstTs ? Date.now() - Number(state.firstTs) : 0,
    changedInRecentFrames,
    signature: frame.signature || null,
    recentObservationCount: Array.isArray(state.observations) ? state.observations.length : 0,
  };
}

export function rememberScreenObservation(sessionId, observation) {
  const state = getSessionState(sessionId);
  const normalized = {
    ts: Date.now(),
    prompt: String(observation?.prompt || "").trim(),
    summary: String(observation?.summary || "").trim(),
    signature: String(observation?.signature || state.latest?.signature || ""),
  };
  if (!normalized.summary) return;
  state.observations = [...(state.observations || []), normalized].slice(-6);
}

export function rememberScreenAnalysis(sessionId, analysis) {
  const state = getSessionState(sessionId);
  const normalized = {
    ts: Date.now(),
    prompt: String(analysis?.prompt || "").trim(),
    result: String(analysis?.result || "").trim(),
    signature: String(analysis?.signature || state.latest?.signature || ""),
  };
  if (!normalized.result || !normalized.signature) return;
  state.analysisCache = [...(state.analysisCache || []), normalized].slice(-10);
}

export function findScreenAnalysis(sessionId, { prompt = "", signature = "" } = {}) {
  const state = getSessionState(sessionId);
  const wantedPrompt = String(prompt || "").trim().toLowerCase();
  const wantedSignature = String(signature || "").trim();
  const cache = [...(state.analysisCache || [])].reverse();

  return cache.find((item) => {
    if (wantedSignature && item.signature !== wantedSignature) return false;
    if (!wantedPrompt) return true;
    const promptText = String(item.prompt || "").toLowerCase();
    return promptText === wantedPrompt || promptText.includes(wantedPrompt) || wantedPrompt.includes(promptText);
  }) || null;
}

export function getRecentScreenObservations(sessionId, { limit = 3 } = {}) {
  const state = getSessionState(sessionId);
  return [...(state.observations || [])].slice(-Math.max(1, limit));
}

export function getScreenAnalysisContext(sessionId, { limit = 2 } = {}) {
  const observations = getRecentScreenObservations(sessionId, { limit });
  if (!observations.length) return "";
  return observations
    .map((item, index) => {
      const label = item.prompt ? `Pergunta: ${item.prompt}` : "Pergunta: (nao especificada)";
      return `Observacao ${index + 1}:\n${label}\nResumo: ${item.summary}`;
    })
    .join("\n\n");
}

export function updateScreenLiveSummary(sessionId, patch = {}) {
  const state = getSessionState(sessionId);
  const current = state.liveSummary || {
    currentFocus: "",
    currentApp: "",
    recentChanges: [],
    recentInsights: [],
    updatedAt: 0,
  };

  const next = {
    ...current,
    ...patch,
    recentChanges: Array.isArray(patch.recentChanges)
      ? patch.recentChanges.slice(-6)
      : current.recentChanges,
    recentInsights: Array.isArray(patch.recentInsights)
      ? patch.recentInsights.slice(-8)
      : current.recentInsights,
    updatedAt: Date.now(),
  };

  state.liveSummary = next;
  return next;
}

export function getScreenLiveSummary(sessionId) {
  const state = getSessionState(sessionId);
  return state.liveSummary || null;
}

export function formatScreenLiveSummary(sessionId) {
  const summary = getScreenLiveSummary(sessionId);
  if (!summary) return "";

  return [
    summary.currentApp ? `App/site atual: ${summary.currentApp}` : "",
    summary.currentFocus ? `Foco visual atual: ${summary.currentFocus}` : "",
    Array.isArray(summary.recentChanges) && summary.recentChanges.length
      ? `Mudancas recentes:\n- ${summary.recentChanges.join("\n- ")}`
      : "",
    Array.isArray(summary.recentInsights) && summary.recentInsights.length
      ? `Achados visuais recentes:\n- ${summary.recentInsights.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function clearScreen(sessionId) {
  const map = getMap();
  map.delete(String(sessionId));
}
