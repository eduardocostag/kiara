function getSessions() {
  if (!globalThis.__KIARA_WS_SESSIONS) {
    globalThis.__KIARA_WS_SESSIONS = new Map(); // sessionId -> Set(ws)
  }
  return globalThis.__KIARA_WS_SESSIONS;
}

export function attachSocket(sessionId, ws) {
  const sid = String(sessionId || "");
  if (!sid) return;

  const sessions = getSessions();
  if (!sessions.has(sid)) sessions.set(sid, new Set());
  sessions.get(sid).add(ws);
}

export function detachSocket(sessionId, ws) {
  const sid = String(sessionId || "");
  if (!sid) return;

  const sessions = getSessions();
  const set = sessions.get(sid);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) sessions.delete(sid);
}

export function emitToSession(sessionId, payload) {
  const sid = String(sessionId || "");
  if (!sid) return;

  const sessions = getSessions();
  const set = sessions.get(sid);
  if (!set) return;

  const msg = JSON.stringify(payload);
  for (const ws of set) {
    try {
      if (ws.readyState === 1) ws.send(msg);
    } catch {
      // ignore
    }
  }
}

