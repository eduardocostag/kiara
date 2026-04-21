function stripMarkdown(text) {
  return String(text || "")
    .replace(/[*_`#>|[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVariant(seed, options) {
  const list = Array.isArray(options) ? options.filter(Boolean) : [];
  if (!list.length) return "";
  const score = [...String(seed || "")].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return list[score % list.length];
}

function addOralLead(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (/^(oi|ola|olá|certo|entendi|perfeito|faz sentido|deixa comigo|ja estou|já estou)/i.test(normalized)) {
    return normalized;
  }

  const lead = pickVariant(normalized, [
    "Entendi.",
    "Certo.",
    "Perfeito.",
    "Faz sentido.",
  ]);

  return `${lead} ${normalized}`.replace(/\s+/g, " ").trim();
}

export function toSpeechText(text) {
  const cleaned = stripMarkdown(text)
    .replace(/\b(contudo|todavia|entretanto)\b/gi, "mas")
    .replace(/\b(segue|conforme|dessa forma)\b/gi, "")
    .replace(/\b(vou organizar isso de forma pratica e objetiva)\b/gi, "vou te responder de forma direta")
    .replace(/\b(vou tratar isso com foco em)\b/gi, "vou olhar isso com foco em")
    .replace(/\b(ja montei um plano de acoes automaticas para avancar sem depender de improviso)\b/gi, "ja tenho um caminho claro para seguir")
    .replace(/\b(com o contexto atual, consigo te orientar sem acionar ferramentas agora)\b/gi, "com o que eu tenho aqui, ja consigo te orientar")
    .replace(/\b(tambem vou considerar o que ja apareceu na conversa e na memoria recente)\b/gi, "tambem estou levando em conta o que ja ficou desta conversa")
    .replace(/\b(posso conversar com continuidade, pesquisar, navegar em sites, automatizar passos e tocar uma tarefa do inicio ao fim)\b/gi, "posso te ajudar no que voce precisar")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);

  return addOralLead(sentences.join(" ").trim());
}

export function pickSpeechText(payload = {}) {
  const spoken = typeof payload.fala === "string" ? payload.fala.trim() : "";
  if (spoken) return toSpeechText(spoken);
  return toSpeechText(payload.texto || "");
}
