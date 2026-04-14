import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs/promises";
import path from "path";

function limparTexto(texto) {
  return String(texto || "")
    .replace(/[*_`]/g, "")
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function appendTtsLog(payload) {
  const logPath = path.join(process.cwd(), "data", "logs", "tts-debug.log");
  const line = `${new Date().toISOString()} | ${JSON.stringify(payload)}\n`;
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, line, "utf8");
  } catch {
    // best effort
  }
}

function withTimeout(task, ms) {
  return Promise.race([
    task,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`tts-timeout-${ms}ms`)), ms)),
  ]);
}

export async function generateTtsBase64(texto) {
  if (!texto) return null;

  try {
    const startedAt = Date.now();
    const tts = new MsEdgeTTS();
    await withTimeout(
      tts.setMetadata(
        "pt-BR-FranciscaNeural",
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      ),
      5000,
    );

    const textoLimpo = limparTexto(texto);
    const { audioStream } = tts.toStream(textoLimpo);

    const chunks = [];
    await withTimeout(
      new Promise((resolve, reject) => {
        audioStream.on("data", (chunk) => chunks.push(chunk));
        audioStream.on("end", resolve);
        audioStream.on("error", reject);
      }),
      10000,
    );

    const buffer = Buffer.concat(chunks);
    if (!buffer || buffer.length === 0) {
      await appendTtsLog({ ok: false, reason: "empty-buffer", elapsedMs: Date.now() - startedAt });
      return null;
    }
    await appendTtsLog({ ok: true, voice: "pt-BR-FranciscaNeural", elapsedMs: Date.now() - startedAt, bytes: buffer.length });
    return buffer.toString("base64");
  } catch (err) {
    await appendTtsLog({ ok: false, message: err?.message || String(err) });
    return null;
  }
}
