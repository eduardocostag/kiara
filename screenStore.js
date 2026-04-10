function getMap() {
  if (!globalThis.__KIARA_SCREEN_STORE) {
    globalThis.__KIARA_SCREEN_STORE = new Map();
  }
  return globalThis.__KIARA_SCREEN_STORE;
}

export function putScreenFrame(sessionId, frame) {
  const map = getMap();
  map.set(String(sessionId), { ...frame, ts: Date.now() });
}

export function getScreenFrame(sessionId) {
  const map = getMap();
  return map.get(String(sessionId)) || null;
}

export function clearScreen(sessionId) {
  const map = getMap();
  map.delete(String(sessionId));
}

