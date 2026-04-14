import fetch from "node-fetch";

export async function analyzeImage({ imageBase64Jpeg, prompt }) {
  const key = process.env.MISTRAL_KEY || process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_VISION_MODEL || "pixtral-large-latest";

  if (!key) {
    return { ok: false, result: "Visão desativada (set MISTRAL_KEY)." };
  }

  const messages = [
    {
      role: "system",
      content:
        "Você descreve imagens com precisão. Responda em português, de forma objetiva e útil (sem markdown).",
    },
    { role: "user", content: String(prompt || "Descreva o que está na tela e pontos importantes.") },
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

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, result: `Falha ao ler resposta do Mistral (HTTP ${res.status})` };
  }

  if (!res.ok) {
    return { ok: false, result: json?.error?.message || `Erro HTTP ${res.status}` };
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, result: "Resposta vazia do modelo de visão." };
  return { ok: true, result: String(content).trim() };
}
