import fetch from "node-fetch";

function normalizeMessages(messages) {
  return Array.isArray(messages)
    ? messages
        .map((message) => ({
          role: message?.role || "user",
          content: typeof message?.content === "string" ? message.content : String(message?.content || ""),
        }))
        .filter((message) => message.content.trim())
    : [];
}

function pickProvider(config = {}) {
  if (config.provider) return String(config.provider).toLowerCase();
  if (config.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || process.env.KIARA_LOCAL_LLM === "1") {
    return "ollama";
  }
  return "mistral";
}

async function callMistral({ apiKey, model, messages, temperature = 0.5 }) {
  if (!apiKey) {
    throw new Error("MISTRAL_KEY nao configurada");
  }

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
    }),
  });

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    const err = new Error("Resposta nao-JSON do Mistral");
    err.raw = raw;
    throw err;
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    const err = new Error("Conteudo vazio do Mistral");
    err.raw = raw;
    throw err;
  }

  return { content, raw, provider: "mistral", model };
}

async function callOllama({ baseUrl, model, messages, temperature = 0.4 }) {
  const resolvedBaseUrl = String(baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const resolvedModel = model || process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";

  const res = await fetch(`${resolvedBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages,
      stream: false,
      options: {
        temperature,
      },
    }),
  });

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    const err = new Error("Resposta nao-JSON do Ollama");
    err.raw = raw;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(json?.error || `Falha no Ollama (${res.status})`);
    err.raw = raw;
    throw err;
  }

  const content = json?.message?.content;
  if (!content || typeof content !== "string") {
    const err = new Error("Conteudo vazio do Ollama");
    err.raw = raw;
    throw err;
  }

  return { content, raw, provider: "ollama", model: resolvedModel };
}

export function buildLlmConfig(overrides = {}) {
  return {
    provider: overrides.provider || process.env.KIARA_LLM_PROVIDER || null,
    model: overrides.model || process.env.KIARA_MODEL || null,
    mistralKey: overrides.mistralKey || process.env.MISTRAL_KEY || null,
    ollamaBaseUrl: overrides.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || null,
  };
}

export async function chatCompletions({ messages, temperature = 0.5, ...config }) {
  const normalizedMessages = normalizeMessages(messages);
  const provider = pickProvider(config);

  if (!normalizedMessages.length) {
    throw new Error("Nenhuma mensagem para o provider de IA");
  }

  if (provider === "ollama") {
    return callOllama({
      baseUrl: config.ollamaBaseUrl,
      model: config.model,
      messages: normalizedMessages,
      temperature,
    });
  }

  return callMistral({
    apiKey: config.mistralKey,
    model: config.model || "mistral-small-latest",
    messages: normalizedMessages,
    temperature,
  });
}
