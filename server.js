import express from "express";
import path from "path";
import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

import { createMemoryStore } from "./memoryStore.js";
import { createKnowledgeStore } from "./knowledgeStore.js";
import { startRun, continueRun } from "./runManager.js";
import { putScreenFrame, clearScreen } from "./screenStore.js";
import { generateTtsBase64 } from "./tts.js";

dotenv.config();

// ──────────────────────────────
// CONFIG ES MODULES
// ──────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ──────────────────────────────
// EXPRESS
// ──────────────────────────────
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ──────────────────────────────
// CONFIG
// ──────────────────────────────
const KEYS = {
  MISTRAL: process.env.MISTRAL_KEY,
};

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const memoryStore = createMemoryStore({ redis, baseDir: __dirname });
const knowledgeStore = createKnowledgeStore({ redis, baseDir: __dirname });

// ──────────────────────────────
// API
// ──────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { pergunta, perfil, autonoma, alocacaoUrl, workspaceId, sessionId, tts } = req.body || {};

  if (!pergunta || typeof pergunta !== "string") {
    return res.json({ texto: "Envie { pergunta: string }.", acoes: [], audio: null });
  }

  try {
    const resposta = await startRun({
      pergunta,
      perfil,
      autonoma: Boolean(autonoma),
      alocacaoUrl,
      workspaceId,
      sessionId,
      memoryStore,
      knowledgeStore,
      baseDir: __dirname,
      mistralKey: KEYS.MISTRAL,
    });

    const ttsMode = String(tts || "server").toLowerCase();
    const audio = ttsMode === "server" ? await generateTtsBase64(resposta.texto) : null;

    return res.json({
      texto: resposta.texto,
      acoes: resposta.acoes || [],
      runId: resposta.runId || null,
      pendencias: resposta.pendencias || [],
      audio,
    });
  } catch (err) {
    console.error(err);
    return res.json({
      texto: "Erro interno, mas estou aprendendo.",
      acoes: [],
      runId: null,
      pendencias: [],
      audio: null,
    });
  }
});

app.post("/api/continue", async (req, res) => {
  const { runId, approvals, tts } = req.body || {};

  try {
    const resposta = await continueRun({
      runId,
      approvals: approvals && typeof approvals === "object" ? approvals : {},
      memoryStore,
      knowledgeStore,
    });

    const ttsMode = String(tts || "server").toLowerCase();
    const audio = ttsMode === "server" ? await generateTtsBase64(resposta.texto) : null;

    return res.json({
      texto: resposta.texto,
      acoes: resposta.acoes || [],
      runId: resposta.runId || null,
      pendencias: resposta.pendencias || [],
      audio,
    });
  } catch (err) {
    console.error(err);
    return res.json({
      texto: "Falha ao continuar a execução.",
      acoes: [],
      runId: null,
      pendencias: [],
      audio: null,
    });
  }
});

app.post("/api/screen/frame", async (req, res) => {
  if (process.env.KIARA_ENABLE_SCREEN !== "1") {
    return res.status(403).json({ ok: false, error: "Tela desativada" });
  }

  const { sessionId, imageBase64Jpeg, w, h } = req.body || {};
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ ok: false, error: "sessionId ausente" });
  }

  const img = String(imageBase64Jpeg || "");
  if (!img || img.length > 2_000_000) {
    return res.status(400).json({ ok: false, error: "Imagem inválida/grande demais" });
  }

  putScreenFrame(sessionId, { imageBase64Jpeg: img, w: Number(w) || null, h: Number(h) || null });
  return res.json({ ok: true });
});

app.post("/api/screen/stop", async (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) clearScreen(sessionId);
  return res.json({ ok: true });
});

// ──────────────────────────────
// START
// ──────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const useWs = process.env.KIARA_ENABLE_WS === "1";
  if (useWs) {
    const { createHttpAndWsServer } = await import("./wsServer.js");
    const { server } = createHttpAndWsServer({
      app,
      memoryStore,
      knowledgeStore,
      baseDir: __dirname,
      mistralKey: KEYS.MISTRAL,
    });
    server.listen(3000, "0.0.0.0", () => {
      console.log("KIARA ONLINE (HTTP + WS + VOZ)");
    });
  } else {
    app.listen(3000, "0.0.0.0", () => {
      console.log("KIARA ONLINE (HTTP + VOZ)");
    });
  }
}

export default app;
