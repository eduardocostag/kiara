import fs from "fs/promises";
import path from "path";

const PROFILE_TO_FILE = {
  marketing: ["marketing", "marketing-social-media-strategist.md"],
  gestao: ["project-management", "project-management-project-shepherd.md"],
  financas: ["support", "support-finance-tracker.md"],
  tecnologia: ["engineering", "engineering-backend-architect.md"],
  automacoes: ["engineering", "engineering-devops-automator.md"],
  "meta-ads": ["paid-media", "paid-media-paid-social-strategist.md"],
  "paid-social": ["paid-media", "paid-media-paid-social-strategist.md"],
};

function extractSection(md, heading) {
  const lines = md.split("\n");
  const startIdx = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (startIdx === -1) return "";
  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("## ")) break;
    out.push(line);
    if (out.length >= 120) break;
  }
  return out.join("\n").trim();
}

export async function loadAgencyReference({ baseDir, perfil }) {
  const key = String(perfil || "").toLowerCase().trim();
  const rel = PROFILE_TO_FILE[key];
  if (!rel) return "";

  const filePath = path.join(baseDir, "vendor", "agency-agents", ...rel);
  try {
    const md = await fs.readFile(filePath, "utf8");
    const role = extractSection(md, "Role Definition");
    const caps = extractSection(md, "Core Capabilities");
    const skills = extractSection(md, "Specialized Skills");
    return [
      `FONTE: agency-agents/${rel.join("/")}`,
      role ? `\nROLE DEFINITION:\n${role}` : "",
      caps ? `\nCORE CAPABILITIES:\n${caps}` : "",
      skills ? `\nSPECIALIZED SKILLS:\n${skills}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
  } catch {
    return "";
  }
}
