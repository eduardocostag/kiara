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
<<<<<<< HEAD
import { buildLlmConfig } from "./llm.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

=======

dotenv.config();

// ──────────────────────────────
// CONFIG ES MODULES
// ──────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ──────────────────────────────
// EXPRESS
// ──────────────────────────────
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

<<<<<<< HEAD
const llmConfig = buildLlmConfig();
=======
// ──────────────────────────────
// CONFIG
// ──────────────────────────────
const KEYS = {
  MISTRAL: process.env.MISTRAL_KEY,
};
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const memoryStore = createMemoryStore({ redis, baseDir: __dirname });
const knowledgeStore = createKnowledgeStore({ redis, baseDir: __dirname });

<<<<<<< HEAD
=======
// ──────────────────────────────
// API
// ──────────────────────────────
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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
<<<<<<< HEAD
      llmConfig,
=======
      mistralKey: KEYS.MISTRAL,
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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
<<<<<<< HEAD
      texto: "Falha ao continuar a execucao.",
=======
      texto: "Falha ao continuar a execução.",
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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
<<<<<<< HEAD
    return res.status(400).json({ ok: false, error: "Imagem invalida/grande demais" });
=======
    return res.status(400).json({ ok: false, error: "Imagem inválida/grande demais" });
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
  }

  putScreenFrame(sessionId, { imageBase64Jpeg: img, w: Number(w) || null, h: Number(h) || null });
  return res.json({ ok: true });
});

app.post("/api/screen/stop", async (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) clearScreen(sessionId);
  return res.json({ ok: true });
});

<<<<<<< HEAD
=======
// ──────────────────────────────
// START
// ──────────────────────────────
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
if (process.env.NODE_ENV !== "production") {
  const useWs = process.env.KIARA_ENABLE_WS === "1";
  if (useWs) {
    const { createHttpAndWsServer } = await import("./wsServer.js");
    const { server } = createHttpAndWsServer({
      app,
      memoryStore,
      knowledgeStore,
      baseDir: __dirname,
<<<<<<< HEAD
      llmConfig,
=======
      mistralKey: KEYS.MISTRAL,
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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
