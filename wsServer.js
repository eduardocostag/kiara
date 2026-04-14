import http from "http";
import { WebSocketServer } from "ws";

import { attachSocket, detachSocket, emitToSession } from "./wsHub.js";
import { startRun, continueRun } from "./runManager.js";
import { putScreenFrame } from "./screenStore.js";
import { emitTextStream } from "./textStream.js";
import { generateTtsBase64 } from "./tts.js";

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function withTimeout(task, ms, label) {
  return Promise.race([
    task,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}-timeout-${ms}ms`)), ms)),
  ]);
}

export function createHttpAndWsServer({
  app,
  memoryStore,
  knowledgeStore,
  baseDir,
  llmConfig,
  logger,
}) {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const sessionId = url.searchParams.get("sessionId") || "";
    if (!sessionId) {
      try {
        ws.send(JSON.stringify({ type: "error", error: "sessionId ausente" }));
      } catch {}
      ws.close();
      return;
    }

    attachSocket(sessionId, ws);
    logger?.info?.("ws.connection.open", { sessionId });
    try {
      ws.send(JSON.stringify({ type: "hello", sessionId }));
    } catch {}

    ws.on("close", () => {
      logger?.info?.("ws.connection.close", { sessionId });
      detachSocket(sessionId, ws);
    });

    ws.on("message", async (data) => {
      const msg = safeJsonParse(String(data || ""));
      if (!msg || typeof msg.type !== "string") return;

      const emit = (payload) => emitToSession(sessionId, payload);
      await logger?.info?.("ws.message.in", {
        sessionId,
        type: msg.type,
        runId: msg.runId || null,
      });

      if (msg.type === "user_text") {
        const text = String(msg.text || "").trim();
        if (!text) return;

        emit({ type: "user_text", text });

        try {
          const resposta = await withTimeout(
            startRun({
              pergunta: text,
              perfil: msg.perfil || null,
              autonoma: Boolean(msg.autonoma),
              alocacaoUrl: msg.alocacaoUrl || null,
              workspaceId: msg.workspaceId || null,
              sessionId,
              memoryStore,
              knowledgeStore,
              baseDir,
              llmConfig,
            }),
            12000,
            "ws-startRun",
          );

          const runId = resposta.runId || null;
          await logger?.info?.("ws.user_text.finish", {
            sessionId,
            runId,
            textoPreview: String(resposta.texto || "").slice(0, 160),
            acoes: Array.isArray(resposta.acoes) ? resposta.acoes.map((item) => item.tipo) : [],
            pendencias: Array.isArray(resposta.pendencias) ? resposta.pendencias.map((item) => item.label || item.id) : [],
          });
          emit({ type: "run", runId });
          emit({ type: "actions", runId, acoes: resposta.acoes || [] });
          if (resposta.pendencias?.length) emit({ type: "pending", runId, pendencias: resposta.pendencias });

          await emitTextStream({
            emit: (payload) => emit({ ...payload, runId }),
            runId,
            text: resposta.texto || "",
          });

          const audio = await generateTtsBase64(resposta.texto || "");
          emit({ type: "audio", runId, audio: audio || null, fallbackText: resposta.texto || "" });
        } catch (err) {
          await logger?.error?.("ws.user_text.error", {
            sessionId,
            message: err?.message || String(err),
            stack: err?.stack || null,
          });
          emit({ type: "error", error: err?.message || String(err) });
        }
      }

      if (msg.type === "approval") {
        const runId = String(msg.runId || "");
        if (!runId) return;

        try {
          const resposta = await withTimeout(
            continueRun({
              runId,
              approvals: msg.approvals && typeof msg.approvals === "object" ? msg.approvals : {},
              memoryStore,
              knowledgeStore,
            }),
            12000,
            "ws-continueRun",
          );

          await logger?.info?.("ws.approval.finish", {
            sessionId,
            runId,
            textoPreview: String(resposta.texto || "").slice(0, 160),
            acoes: Array.isArray(resposta.acoes) ? resposta.acoes.map((item) => item.tipo) : [],
            pendencias: Array.isArray(resposta.pendencias) ? resposta.pendencias.map((item) => item.label || item.id) : [],
          });
          emit({ type: "actions", runId, acoes: resposta.acoes || [] });
          if (resposta.pendencias?.length) emit({ type: "pending", runId, pendencias: resposta.pendencias });

          await emitTextStream({
            emit: (payload) => emit({ ...payload, runId }),
            runId,
            text: resposta.texto || "",
          });

          const audio = await generateTtsBase64(resposta.texto || "");
          emit({ type: "audio", runId, audio: audio || null, fallbackText: resposta.texto || "" });
        } catch (err) {
          await logger?.error?.("ws.approval.error", {
            sessionId,
            runId,
            message: err?.message || String(err),
            stack: err?.stack || null,
          });
          emit({ type: "error", error: err?.message || String(err) });
        }
      }

      if (msg.type === "screen_frame") {
        if (process.env.KIARA_ENABLE_SCREEN !== "1") return;
        const base64 = String(msg.imageBase64Jpeg || "");
        if (!base64 || base64.length > 2_000_000) return;
        putScreenFrame(sessionId, {
          imageBase64Jpeg: base64,
          w: Number(msg.w) || null,
          h: Number(msg.h) || null,
        });
        emit({ type: "screen_ack" });
      }
    });
  });

  return { server, wss };
}
