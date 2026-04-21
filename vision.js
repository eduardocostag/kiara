import fetch from "node-fetch";
import { extractJsonObject } from "./json.js";

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

async function runVisionRequest({ imageBase64Jpeg, prompt, systemPrompt, temperature = 0.15 }) {
  const key = process.env.MISTRAL_KEY || process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_VISION_MODEL || "pixtral-large-latest";

  if (!key) {
    return { ok: false, result: "Visao desativada (set MISTRAL_KEY)." };
  }

  const messages = [
    {
      role: "system",
      content: String(systemPrompt || "").trim(),
    },
    { role: "user", content: String(prompt || "Descreva o que esta na tela e pontos importantes.") },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: `data:image/jpeg;base64,${imageBase64Jpeg}`,
        },
      ],
    },
  ];

  const request = timeoutSignal(12000);
  let res;
  try {
    res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
      signal: request.signal,
    });
  } catch (err) {
    request.clear();
    const message = err?.name === "AbortError" ? "Timeout da visao" : err?.message || String(err);
    return { ok: false, result: message };
  } finally {
    request.clear();
  }

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, result: `Falha ao ler resposta do modelo de visao (HTTP ${res.status})` };
  }

  if (!res.ok) {
    return { ok: false, result: json?.error?.message || `Erro HTTP ${res.status}` };
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, result: "Resposta vazia do modelo de visao." };
  return { ok: true, result: String(content).trim() };
}

export async function analyzeImage({ imageBase64Jpeg, prompt }) {
  return runVisionRequest({
    imageBase64Jpeg,
    prompt,
    systemPrompt: [
      "Voce analisa capturas de tela de interface com foco operacional.",
      "Responda em portugues de forma objetiva e util.",
      "Priorize: app ou site atual, o que esta visivel, erro ou bloqueio, CTA ou botao principal, e proximo passo pratico.",
      "Se houver texto legivel, transcreva apenas o essencial.",
      "Se algo estiver incerto, diga que e uma inferencia.",
      "Evite markdown pesado.",
    ].join(" "),
  });
}

function normalizeList(value, max = 6) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeStructuredVision(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    appOrSite: String(raw.appOrSite || raw.app || raw.site || "").trim(),
    screenType: String(raw.screenType || raw.tipoTela || "").trim(),
    visibleText: normalizeList(raw.visibleText || raw.textosVisiveis || raw.texts, 10),
    primaryAction: String(raw.primaryAction || raw.acaoPrincipal || "").trim(),
    errors: normalizeList(raw.errors || raw.erros, 5),
    importantElements: normalizeList(raw.importantElements || raw.elementosImportantes || raw.elements, 8),
    nextStep: String(raw.nextStep || raw.proximoPasso || "").trim(),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    summary: String(raw.summary || raw.resumo || "").trim(),
  };
}

function formatStructuredVision(structured) {
  const lines = [];
  if (structured.summary) lines.push(`Resumo: ${structured.summary}`);
  if (structured.appOrSite) lines.push(`App/Site: ${structured.appOrSite}`);
  if (structured.screenType) lines.push(`Tela: ${structured.screenType}`);
  if (structured.primaryAction) lines.push(`Acao principal: ${structured.primaryAction}`);
  if (structured.importantElements.length) lines.push(`Elementos importantes: ${structured.importantElements.join("; ")}`);
  if (structured.visibleText.length) lines.push(`Texto visivel: ${structured.visibleText.join(" | ")}`);
  if (structured.errors.length) lines.push(`Erros/Bloqueios: ${structured.errors.join("; ")}`);
  if (structured.nextStep) lines.push(`Proximo passo: ${structured.nextStep}`);
  if (structured.confidence) lines.push(`Confianca: ${Math.round(structured.confidence * 100)}%`);
  return lines.join("\n").trim();
}

export async function analyzeImageStructured({ imageBase64Jpeg, prompt }) {
  const systemPrompt = [
    "Voce analisa capturas de tela de interface para automacao e suporte operacional.",
    "Responda somente com JSON valido, sem markdown, sem cercas de codigo e sem texto fora do JSON.",
    "Extraia o maximo possivel de estrutura util da tela atual.",
    "Se nao tiver certeza, use strings curtas e confidence menor.",
    "Campos obrigatorios do JSON:",
    "{",
    '"summary":"resumo curto do que esta acontecendo",',
    '"appOrSite":"app, site ou contexto principal",',
    '"screenType":"tipo da tela ou etapa atual",',
    '"visibleText":["textos curtos legiveis e relevantes"],',
    '"primaryAction":"acao principal disponivel ou foco atual",',
    '"errors":["erros, bloqueios ou alertas visiveis"],',
    '"importantElements":["botoes, campos, modais, menus ou itens importantes"],',
    '"nextStep":"proximo passo pratico recomendado",',
    '"confidence":0.0',
    "}",
  ].join(" ");

  const response = await runVisionRequest({
    imageBase64Jpeg,
    prompt,
    systemPrompt,
    temperature: 0.05,
  });

  if (!response.ok) return { ok: false, result: response.result, structured: null };
  const parsed = normalizeStructuredVision(extractJsonObject(response.result));
  if (!parsed) {
    return {
      ok: false,
      result: "Falha ao estruturar resposta visual",
      structured: null,
      raw: response.result,
    };
  }

  return {
    ok: true,
    result: formatStructuredVision(parsed),
    structured: parsed,
    raw: response.result,
  };
}
