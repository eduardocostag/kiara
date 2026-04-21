import fs from "fs/promises";
import path from "path";
import { extractSearchTerms } from "./textSearch.js";

const PROFILE_DEFAULTS = {
  marketing: ["marketing-growth-hacker", "marketing-social-media-strategist"],
  gestao: ["management-project-shepherd", "management-operations-manager"],
  financas: ["finance-finance-tracker", "finance-revenue-analyst"],
  vendas: ["sales-conversion-closer", "sales-sales-strategist"],
  engenharia: ["engineering-code-reviewer", "engineering-devops-automator"],
  tecnologia: ["technology-backend-architect", "technology-automation-architect"],
  produto: ["product-product-strategist", "management-project-shepherd"],
  estrategia: ["strategy-business-strategist", "management-project-shepherd"],
  suporte: ["support-customer-support-specialist", "management-operations-manager"],
  testes: ["testing-qa-test-engineer", "engineering-code-reviewer"],
  qa: ["testing-qa-test-engineer", "engineering-code-reviewer"],
  automacoes: ["technology-automation-architect"],
  assistente: ["management-project-shepherd", "technology-automation-architect"],
  infraestrutura: ["infra-linux-systems-engineer", "infra-docker-platform-engineer"],
  infra: ["infra-linux-systems-engineer", "infra-docker-platform-engineer"],
  linux: ["infra-linux-systems-engineer"],
  docker: ["infra-docker-platform-engineer"],
  "meta-ads": ["marketing-paid-social-strategist", "marketing-growth-hacker"],
  "paid-social": ["marketing-paid-social-strategist"],
};

const KEYWORD_TO_AGENTS = {
  marketing: ["marketing-growth-hacker", "marketing-social-media-strategist"],
  copy: ["marketing-growth-hacker", "sales-conversion-closer"],
  crm: ["marketing-growth-hacker", "sales-sales-strategist"],
  cac: ["marketing-growth-hacker", "finance-revenue-analyst"],
  ltv: ["marketing-growth-hacker", "finance-revenue-analyst"],
  roas: ["marketing-paid-social-strategist", "finance-revenue-analyst"],
  roi: ["marketing-growth-hacker", "finance-revenue-analyst"],
  cpl: ["marketing-paid-social-strategist", "sales-sales-strategist"],
  conteudo: ["marketing-social-media-strategist"],
  social: ["marketing-social-media-strategist"],
  instagram: ["marketing-social-media-strategist"],
  anuncios: ["marketing-paid-social-strategist"],
  meta: ["marketing-paid-social-strategist"],
  trafego: ["marketing-paid-social-strategist"],
  vendas: ["sales-sales-strategist", "sales-conversion-closer"],
  vender: ["sales-sales-strategist", "sales-conversion-closer"],
  outbound: ["sales-sales-strategist", "sales-conversion-closer"],
  inbound: ["sales-sales-strategist", "marketing-growth-hacker"],
  qualificacao: ["sales-sales-strategist"],
  followup: ["sales-conversion-closer"],
  follow: ["sales-conversion-closer"],
  fechamento: ["sales-conversion-closer"],
  proposta: ["sales-conversion-closer"],
  oferta: ["sales-sales-strategist", "marketing-growth-hacker"],
  lead: ["sales-sales-strategist", "marketing-growth-hacker"],
  funil: ["technology-automation-architect", "sales-sales-strategist", "marketing-growth-hacker"],
  financeiro: ["finance-finance-tracker", "finance-revenue-analyst"],
  financas: ["finance-finance-tracker", "finance-revenue-analyst"],
  precificacao: ["finance-revenue-analyst", "sales-sales-strategist"],
  fluxo: ["finance-finance-tracker", "management-operations-manager"],
  dre: ["finance-finance-tracker", "finance-revenue-analyst"],
  inadimplencia: ["finance-finance-tracker", "finance-revenue-analyst"],
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
  workflow: ["technology-automation-architect"],
  pipeline: ["technology-automation-architect", "sales-sales-strategist"],
  rotina: ["technology-automation-architect", "management-operations-manager"],
  integracao: ["technology-automation-architect", "technology-backend-architect"],
  webhook: ["technology-automation-architect", "technology-backend-architect"],
  agente: ["technology-automation-architect", "management-project-shepherd"],
  assistente: ["management-project-shepherd", "technology-automation-architect"],
  pesquisa: ["management-project-shepherd", "marketing-growth-hacker"],
  navegar: ["technology-automation-architect", "management-project-shepherd"],
  frontend: ["engineering-frontend-developer"],
  interface: ["engineering-frontend-developer", "product-product-strategist"],
  ui: ["engineering-frontend-developer"],
  ux: ["engineering-frontend-developer", "product-product-strategist"],
  componente: ["engineering-frontend-developer"],
  react: ["engineering-frontend-developer"],
  review: ["engineering-code-reviewer"],
  revisar: ["engineering-code-reviewer"],
  codigo: ["engineering-code-reviewer", "technology-backend-architect"],
  bug: ["testing-qa-test-engineer", "engineering-code-reviewer"],
  regressao: ["testing-qa-test-engineer", "engineering-code-reviewer"],
  teste: ["testing-qa-test-engineer"],
  testes: ["testing-qa-test-engineer"],
  qa: ["testing-qa-test-engineer"],
  qualidade: ["testing-qa-test-engineer", "engineering-code-reviewer"],
  suporte: ["support-customer-support-specialist"],
  atendimento: ["support-customer-support-specialist"],
  ticket: ["support-customer-support-specialist"],
  cliente: ["support-customer-support-specialist", "sales-sales-strategist"],
  produto: ["product-product-strategist"],
  feature: ["product-product-strategist", "engineering-code-reviewer"],
  roadmap: ["product-product-strategist", "management-project-shepherd"],
  discovery: ["product-product-strategist"],
  mvp: ["product-product-strategist", "strategy-business-strategist"],
  estrategia: ["strategy-business-strategist"],
  estrategico: ["strategy-business-strategist"],
  mercado: ["strategy-business-strategist"],
  posicionamento: ["strategy-business-strategist"],
  devops: ["engineering-devops-automator", "infra-linux-systems-engineer"],
  deploy: ["engineering-devops-automator", "infra-docker-platform-engineer"],
  pipeline: ["engineering-devops-automator"],
  cicd: ["engineering-devops-automator"],
  observabilidade: ["engineering-devops-automator"],
  seguranca: ["engineering-security-engineer"],
  security: ["engineering-security-engineer"],
  vulnerabilidade: ["engineering-security-engineer"],
  autenticacao: ["engineering-security-engineer"],
  acesso: ["engineering-security-engineer"],
  site: ["marketing-growth-hacker", "technology-backend-architect"],
  seo: ["marketing-growth-hacker"],
  tecnologia: ["technology-backend-architect"],
  api: ["technology-backend-architect", "technology-automation-architect"],
  infraestrutura: ["infra-linux-systems-engineer", "infra-docker-platform-engineer"],
  infra: ["infra-linux-systems-engineer", "infra-docker-platform-engineer"],
  linux: ["infra-linux-systems-engineer"],
  ubuntu: ["infra-linux-systems-engineer"],
  debian: ["infra-linux-systems-engineer"],
  docker: ["infra-docker-platform-engineer"],
  compose: ["infra-docker-platform-engineer"],
  container: ["infra-docker-platform-engineer"],
  containers: ["infra-docker-platform-engineer"],
  nginx: ["infra-linux-systems-engineer", "infra-docker-platform-engineer"],
  systemd: ["infra-linux-systems-engineer"],
  servidor: ["infra-linux-systems-engineer"],
  devops: ["infra-linux-systems-engineer", "infra-docker-platform-engineer"],
};

function uniq(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function section(md, heading) {
  const lines = String(md || "").split("\n");
  const normalizedHeading = `## ${normalizeText(heading)}`;
  const startIdx = lines.findIndex((line) => normalizeText(line) === normalizedHeading);
  if (startIdx === -1) return "";

  const out = [];
  for (let index = startIdx + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim().startsWith("## ")) break;
    out.push(line);
    if (out.length >= 120) break;
  }
  return out.join("\n").trim();
}

function bullets(text, limit = 8) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function steps(text, limit = 8) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[\).\s-]*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

async function readAgentIndex(baseDir) {
  try {
    const indexPath = path.join(baseDir, "data", "kiara", "agents", "index.json");
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.agents) ? parsed.agents : [];
    return new Map(entries.map((item) => [String(item.slug), item]));
  } catch {
    return new Map();
  }
}

async function readAgentFile(baseDir, slug, indexMap) {
  const filePath = path.join(baseDir, "data", "kiara", "agents", `${slug}.md`);
  const md = await fs.readFile(filePath, "utf8");
  const meta = indexMap.get(slug) || {};

  const objective = section(md, "Objetivo");
  const activateWhen = section(md, "Ativar Quando");
  const method = section(md, "Metodo");
  const metrics = section(md, "Metricas");
  const avoid = section(md, "Evitar");

  return {
    slug,
    title: meta.title || slug,
    area: meta.area || "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    priority: Number(meta.priority || 0) || 0,
    filePath,
    md,
    objective,
    activateWhen,
    method,
    metrics,
    avoid,
    activationSignals: bullets(activateWhen, 6),
    methodSteps: steps(method, 6),
    successMetrics: bullets(metrics, 6),
    guardrails: bullets(avoid, 5),
  };
}

function pickAgentSlugs({ perfil, pergunta, indexMap }) {
  const profileKey = String(perfil || "").toLowerCase().trim();
  const terms = extractSearchTerms(pergunta, { limit: 20 });

  const selected = [...(PROFILE_DEFAULTS[profileKey] || [])];
  for (const term of terms) {
    const matches = KEYWORD_TO_AGENTS[term];
    if (matches) selected.push(...matches);
  }

  const available = new Set(indexMap.keys());
  return uniq(selected)
    .filter((slug) => available.has(slug))
    .slice(0, 6);
}

function inferExecutionPlan({ pergunta, agents }) {
  const lower = normalizeText(pergunta);
  const plan = [];

  if (/\b(analise|diagnostico|auditoria|auditar|seo|site)\b/.test(lower)) {
    plan.push("Auditar o contexto atual antes de propor mudancas.");
  }
  if (/\b(pesquise|procure|busque|investigue|levantamento)\b/.test(lower)) {
    plan.push("Pesquisar fontes e consolidar achados antes de concluir.");
  }
  if (/\b(automacao|automacoes|agente|workflow|processo)\b/.test(lower)) {
    plan.push("Mapear gatilho, entradas, decisoes, saidas e pontos de falha.");
  }
  if (/\b(docker|linux|infra|servidor|deploy|container)\b/.test(lower)) {
    plan.push("Diagnosticar por camadas: ambiente, servicos, logs, rede, volumes e permissoes.");
  }

  for (const agent of agents) {
    if (agent.methodSteps?.length) {
      const firstStep = agent.methodSteps[0];
      if (firstStep) plan.push(firstStep);
    }
  }

  return uniq(plan).slice(0, 6);
}

function formatAgent(agent) {
  return [
    `AGENTE: ${agent.slug}`,
    agent.title ? `TITULO: ${agent.title}` : "",
    agent.area ? `AREA: ${agent.area}` : "",
    agent.tags?.length ? `TAGS: ${agent.tags.join(", ")}` : "",
    agent.objective ? `OBJETIVO:\n${agent.objective}` : "",
    agent.activationSignals?.length ? `ATIVAR QUANDO:\n- ${agent.activationSignals.join("\n- ")}` : "",
    agent.methodSteps?.length ? `METODO:\n- ${agent.methodSteps.join("\n- ")}` : "",
    agent.successMetrics?.length ? `METRICAS:\n- ${agent.successMetrics.join("\n- ")}` : "",
    agent.guardrails?.length ? `EVITAR:\n- ${agent.guardrails.join("\n- ")}` : "",
    `FONTE: data/kiara/agents/${agent.slug}.md`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatPlan(plan) {
  if (!Array.isArray(plan) || !plan.length) return "";
  return plan.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

export async function loadAgencyContext({ baseDir, perfil, pergunta = "" }) {
  const indexMap = await readAgentIndex(baseDir);
  const slugs = pickAgentSlugs({ perfil, pergunta, indexMap });
  if (!slugs.length) {
    return {
      agents: [],
      plan: [],
      rosterSummary: "",
      referenceText: "",
    };
  }

  const loaded = [];
  for (const slug of slugs) {
    try {
      loaded.push(await readAgentFile(baseDir, slug, indexMap));
    } catch {
      // ignore missing local agent files
    }
  }

  const agents = loaded.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)).slice(0, 5);
  const plan = inferExecutionPlan({ pergunta, agents });
  const rosterSummary = agents.map((agent) => `${agent.slug}${agent.area ? ` (${agent.area})` : ""}`).join(", ");
  const referenceText = agents.map(formatAgent).join("\n\n---\n\n");

  return {
    agents,
    plan,
    rosterSummary,
    referenceText,
    formattedPlan: formatPlan(plan),
  };
}

export async function loadAgencyReference({ baseDir, perfil, pergunta = "" }) {
  const context = await loadAgencyContext({ baseDir, perfil, pergunta });
  return context.referenceText || "";
}
