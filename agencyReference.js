import fs from "fs/promises";
import path from "path";
import { extractSearchTerms } from "./textSearch.js";

const PROFILE_DEFAULTS = {
  marketing: ["marketing-growth-hacker", "marketing-social-media-strategist"],
  gestao: ["management-project-shepherd", "management-operations-manager"],
  financas: ["finance-finance-tracker", "finance-revenue-analyst"],
  vendas: ["sales-conversion-closer", "sales-sales-strategist"],
  tecnologia: ["technology-backend-architect", "technology-automation-architect"],
  automacoes: ["technology-automation-architect"],
  "meta-ads": ["marketing-paid-social-strategist", "marketing-growth-hacker"],
  "paid-social": ["marketing-paid-social-strategist"],
};

const KEYWORD_TO_AGENTS = {
  marketing: ["marketing-growth-hacker", "marketing-social-media-strategist"],
  copy: ["marketing-growth-hacker", "sales-conversion-closer"],
  conteudo: ["marketing-social-media-strategist"],
  social: ["marketing-social-media-strategist"],
  instagram: ["marketing-social-media-strategist"],
  anuncios: ["marketing-paid-social-strategist"],
  meta: ["marketing-paid-social-strategist"],
  trafego: ["marketing-paid-social-strategist"],
  vendas: ["sales-sales-strategist", "sales-conversion-closer"],
  vender: ["sales-sales-strategist", "sales-conversion-closer"],
  proposta: ["sales-conversion-closer"],
  oferta: ["sales-sales-strategist", "marketing-growth-hacker"],
  lead: ["sales-sales-strategist", "marketing-growth-hacker"],
  funil: ["sales-sales-strategist", "marketing-growth-hacker"],
  financeiro: ["finance-finance-tracker", "finance-revenue-analyst"],
  financas: ["finance-finance-tracker", "finance-revenue-analyst"],
  caixa: ["finance-finance-tracker"],
  margem: ["finance-revenue-analyst"],
  lucro: ["finance-revenue-analyst"],
  gestao: ["management-project-shepherd", "management-operations-manager"],
  processo: ["management-operations-manager"],
  operacao: ["management-operations-manager"],
  prioridade: ["management-project-shepherd"],
  backlog: ["management-project-shepherd"],
  automacao: ["technology-automation-architect"],
  automacoes: ["technology-automation-architect"],
  agente: ["technology-automation-architect", "management-project-shepherd"],
  site: ["marketing-growth-hacker", "technology-backend-architect"],
  seo: ["marketing-growth-hacker"],
  tecnologia: ["technology-backend-architect"],
  api: ["technology-backend-architect", "technology-automation-architect"],
};

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function section(md, heading) {
  const lines = String(md || "").split("\n");
  const startIdx = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (startIdx === -1) return "";

  const out = [];
  for (let index = startIdx + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim().startsWith("## ")) break;
    out.push(line);
    if (out.length >= 80) break;
  }
  return out.join("\n").trim();
}

async function readAgentFile(baseDir, slug) {
  const filePath = path.join(baseDir, "data", "kiara", "agents", `${slug}.md`);
  const md = await fs.readFile(filePath, "utf8");
  return {
    slug,
    filePath,
    md,
    summary: [
      section(md, "Objetivo"),
      section(md, "Ativar Quando"),
      section(md, "Metodo"),
      section(md, "Metricas"),
      section(md, "Evitar"),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function pickAgentSlugs({ perfil, pergunta }) {
  const profileKey = String(perfil || "").toLowerCase().trim();
  const terms = extractSearchTerms(pergunta, { limit: 20 });

  const selected = [...(PROFILE_DEFAULTS[profileKey] || [])];
  for (const term of terms) {
    const matches = KEYWORD_TO_AGENTS[term];
    if (matches) selected.push(...matches);
  }

  return uniq(selected).slice(0, 5);
}

export async function loadAgencyReference({ baseDir, perfil, pergunta = "" }) {
  const slugs = pickAgentSlugs({ perfil, pergunta });
  if (!slugs.length) return "";

  const loaded = [];
  for (const slug of slugs) {
    try {
      loaded.push(await readAgentFile(baseDir, slug));
    } catch {
      // ignore missing local agent files
    }
  }

  if (!loaded.length) return "";

  return loaded
    .map((agent) =>
      [
        `AGENTE: ${agent.slug}`,
        `FONTE: data/kiara/agents/${agent.slug}.md`,
        agent.summary || agent.md.slice(0, 1800),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");
}
