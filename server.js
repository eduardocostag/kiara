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
import { buildLlmConfig } from "./llm.js";
import { createLogger } from "./logger.js";
import { createActionLearningStore } from "./actionLearningStore.js";

function withTimeout(task, ms, label) {
  return Promise.race([
    task,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}-timeout-${ms}ms`)), ms)),
  ]);
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const llmConfig = buildLlmConfig();
const logger = createLogger({ baseDir: __dirname });

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const memoryStore = createMemoryStore({ redis, baseDir: __dirname });
const knowledgeStore = createKnowledgeStore({ redis, baseDir: __dirname });
const actionLearningStore = createActionLearningStore({ baseDir: __dirname });

app.post("/api/chat", async (req, res) => {
  const { pergunta, perfil, autonoma, alocacaoUrl, workspaceId, sessionId, tts } = req.body || {};
  const startedAt = Date.now();

  if (!pergunta || typeof pergunta !== "string") {
    return res.json({ texto: "Envie { pergunta: string }.", acoes: [], audio: null });
  }

  try {
    await logger.info("api.chat.start", {
      sessionId: sessionId || null,
      workspaceId: workspaceId || null,
      perfil: perfil || null,
      autonoma: Boolean(autonoma),
      tts: tts || null,
      perguntaPreview: String(pergunta).slice(0, 160),
    });

    const resposta = await withTimeout(
      startRun({
        pergunta,
        perfil,
        autonoma: Boolean(autonoma),
        alocacaoUrl,
        workspaceId,
        sessionId,
        memoryStore,
        knowledgeStore,
        baseDir: __dirname,
        llmConfig,
      }),
      20000,
      "startRun",
    );

    const ttsMode = String(tts || "server").toLowerCase();
    const audio = ttsMode === "server" ? await generateTtsBase64(resposta.fala || resposta.texto) : null;

    await logger.info("api.chat.finish", {
      sessionId: sessionId || null,
      runId: resposta.runId || null,
      elapsedMs: Date.now() - startedAt,
      textoPreview: String(resposta.texto || "").slice(0, 160),
      acoes: Array.isArray(resposta.acoes) ? resposta.acoes.map((item) => item.tipo) : [],
      pendencias: Array.isArray(resposta.pendencias) ? resposta.pendencias.map((item) => item.label || item.id) : [],
      audio: Boolean(audio),
    });

    return res.json({
      texto: resposta.texto,
      fala: resposta.fala || resposta.texto,
      acoes: resposta.acoes || [],
      runId: resposta.runId || null,
      pendencias: resposta.pendencias || [],
      audio,
    });
  } catch (err) {
    console.error(err);
    await logger.error("api.chat.error", {
      sessionId: sessionId || null,
      elapsedMs: Date.now() - startedAt,
      message: err?.message || String(err),
      stack: err?.stack || null,
    });
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
  const startedAt = Date.now();

  try {
    await logger.info("api.continue.start", {
      runId: runId || null,
      approvals: approvals && typeof approvals === "object" ? Object.keys(approvals) : [],
      tts: tts || null,
    });

    const resposta = await withTimeout(
      continueRun({
        runId,
        approvals: approvals && typeof approvals === "object" ? approvals : {},
        memoryStore,
        knowledgeStore,
      }),
      20000,
      "continueRun",
    );

    const ttsMode = String(tts || "server").toLowerCase();
    const audio = ttsMode === "server" ? await generateTtsBase64(resposta.fala || resposta.texto) : null;

    await logger.info("api.continue.finish", {
      runId: resposta.runId || null,
      elapsedMs: Date.now() - startedAt,
      textoPreview: String(resposta.texto || "").slice(0, 160),
      acoes: Array.isArray(resposta.acoes) ? resposta.acoes.map((item) => item.tipo) : [],
      pendencias: Array.isArray(resposta.pendencias) ? resposta.pendencias.map((item) => item.label || item.id) : [],
      audio: Boolean(audio),
    });

    return res.json({
      texto: resposta.texto,
      fala: resposta.fala || resposta.texto,
      acoes: resposta.acoes || [],
      runId: resposta.runId || null,
      pendencias: resposta.pendencias || [],
      audio,
    });
  } catch (err) {
    console.error(err);
    await logger.error("api.continue.error", {
      runId: runId || null,
      elapsedMs: Date.now() - startedAt,
      message: err?.message || String(err),
      stack: err?.stack || null,
    });
    return res.json({
      texto: "Falha ao continuar a execucao.",
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
    return res.status(400).json({ ok: false, error: "Imagem invalida/grande demais" });
  }

  putScreenFrame(sessionId, { imageBase64Jpeg: img, w: Number(w) || null, h: Number(h) || null });
  return res.json({ ok: true });
});

app.post("/api/screen/stop", async (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) clearScreen(sessionId);
  return res.json({ ok: true });
});

app.get("/api/workspace/:workspaceId/learned-actions", async (req, res) => {
  const workspaceId = String(req.params.workspaceId || "default");
  try {
    const summary = await actionLearningStore.summarizeWorkspace(workspaceId, {});
    return res.json({ ok: true, workspaceId, summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

if (process.env.NODE_ENV !== "production") {
  const useWs = process.env.KIARA_ENABLE_WS === "1";
  if (useWs) {
    const { createHttpAndWsServer } = await import("./wsServer.js");
    const { server } = createHttpAndWsServer({
      app,
      memoryStore,
      knowledgeStore,
      baseDir: __dirname,
      llmConfig,
      logger,
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
