function splitIntoChunks(text, maxLen = 220) {
  const t = String(text || "").trim();
  if (!t) return [];

  const parts = t
    .replace(/\r/g, "")
    .split(/(?<=[\.\!\?\:\;])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  for (const p of parts) {
    if (p.length <= maxLen) {
      chunks.push(p);
      continue;
    }
    let i = 0;
    while (i < p.length) {
      chunks.push(p.slice(i, i + maxLen));
      i += maxLen;
    }
  }

  return chunks;
}

export async function emitTextStream({ emit, runId, text }) {
  const chunks = splitIntoChunks(text, 220);
  if (!chunks.length) {
    emit({ type: "assistant_text", runId, chunk: "", final: true });
    return;
  }

  emit({ type: "assistant_text", runId, chunk: chunks[0], final: false, idx: 0 });
  for (let i = 1; i < chunks.length; i++) {
    // pequena folga para UI/TTS enfileirar sem travar
    await new Promise((r) => setTimeout(r, 15));
    emit({ type: "assistant_text", runId, chunk: chunks[i], final: false, idx: i });
  }
  emit({ type: "assistant_text", runId, chunk: "", final: true, idx: chunks.length });
}

