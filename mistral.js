import fetch from "node-fetch";

export async function mistralChatCompletions({
  apiKey,
  model,
  messages,
  temperature = 0.5,
}) {
  if (!apiKey) {
    throw new Error("MISTRAL_KEY não configurada");
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
    const err = new Error("Resposta não-JSON do Mistral");
    err.raw = raw;
    throw err;
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    const err = new Error("Conteúdo vazio do Mistral");
    err.raw = raw;
    throw err;
  }

  return { content, raw };
}

