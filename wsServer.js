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

export function createHttpAndWsServer({
  app,
  memoryStore,
  knowledgeStore,
  baseDir,
<<<<<<< HEAD
  llmConfig,
=======
  mistralKey,
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
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
    try {
      ws.send(JSON.stringify({ type: "hello", sessionId }));
    } catch {}

    ws.on("close", () => detachSocket(sessionId, ws));

    ws.on("message", async (data) => {
      const msg = safeJsonParse(String(data || ""));
      if (!msg || typeof msg.type !== "string") return;

      const emit = (payload) => emitToSession(sessionId, payload);

      if (msg.type === "user_text") {
        const text = String(msg.text || "").trim();
        if (!text) return;

        emit({ type: "user_text", text });

        try {
          const resposta = await startRun({
            pergunta: text,
            perfil: msg.perfil || null,
            autonoma: Boolean(msg.autonoma),
            alocacaoUrl: msg.alocacaoUrl || null,
            workspaceId: msg.workspaceId || null,
            sessionId,
            memoryStore,
            knowledgeStore,
            baseDir,
<<<<<<< HEAD
            llmConfig,
=======
            mistralKey,
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
          });

          const runId = resposta.runId || null;
          emit({ type: "run", runId });
<<<<<<< HEAD
          emit({ type: "actions", runId, acoes: resposta.acoes || [] });
          if (resposta.pendencias?.length) emit({ type: "pending", runId, pendencias: resposta.pendencias });

          await emitTextStream({
            emit: (payload) => emit({ ...payload, runId }),
=======

          emit({ type: "actions", runId, acoes: resposta.acoes || [] });
          if (resposta.pendencias?.length) {
            emit({ type: "pending", runId, pendencias: resposta.pendencias });
          }

          await emitTextStream({
            emit: (p) => emit({ ...p, runId }),
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
            runId,
            text: resposta.texto || "",
          });

<<<<<<< HEAD
=======
          // Voz feminina única (server TTS). Envia no final para o client tocar.
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
          const audio = await generateTtsBase64(resposta.texto || "");
          if (audio) emit({ type: "audio", runId, audio });
        } catch (err) {
          emit({ type: "error", error: err?.message || String(err) });
        }
      }

      if (msg.type === "approval") {
        const runId = String(msg.runId || "");
        if (!runId) return;

        try {
          const resposta = await continueRun({
            runId,
            approvals: msg.approvals && typeof msg.approvals === "object" ? msg.approvals : {},
            memoryStore,
            knowledgeStore,
          });

          emit({ type: "actions", runId, acoes: resposta.acoes || [] });
<<<<<<< HEAD
          if (resposta.pendencias?.length) emit({ type: "pending", runId, pendencias: resposta.pendencias });

          await emitTextStream({
            emit: (payload) => emit({ ...payload, runId }),
=======
          if (resposta.pendencias?.length) {
            emit({ type: "pending", runId, pendencias: resposta.pendencias });
          }

          await emitTextStream({
            emit: (p) => emit({ ...p, runId }),
>>>>>>> 2e1f73923d7a928f95e67d48f7e466e5a01ba40a
            runId,
            text: resposta.texto || "",
          });

          const audio = await generateTtsBase64(resposta.texto || "");
          if (audio) emit({ type: "audio", runId, audio });
        } catch (err) {
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
