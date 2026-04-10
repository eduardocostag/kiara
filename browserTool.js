import fs from "fs/promises";
import path from "path";

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function domainAllowed(url) {
  if (process.env.KIARA_ALLOW_ANY_DOMAIN === "1") return true;

  const raw = String(process.env.KIARA_ALLOWED_DOMAINS || "").trim();
  if (!raw) return false;

  const allow = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  try {
    const host = new URL(url).hostname.toLowerCase();
    return allow.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

function truncate(text, max = 9000) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n...[TRUNCADO]`;
}

async function getPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const err = new Error('Playwright não instalado (rode "npm i playwright")');
    err.code = "KIARA_NO_PLAYWRIGHT";
    throw err;
  }
}

export async function runBrowserTask({
  baseDir,
  url,
  steps = [],
  objective,
  headless = true,
}) {
  if (process.env.KIARA_ENABLE_PLAYWRIGHT !== "1") {
    return {
      ok: false,
      result: "Playwright desativado (set KIARA_ENABLE_PLAYWRIGHT=1)",
    };
  }

  const targetUrl = String(url || "");
  if (!isHttpUrl(targetUrl)) return { ok: false, result: "URL inválida" };
  if (!domainAllowed(targetUrl)) {
    return {
      ok: false,
      result:
        "Domínio não permitido (defina KIARA_ALLOWED_DOMAINS=ex.com,site.com ou KIARA_ALLOW_ANY_DOMAIN=1)",
    };
  }

  const pw = await getPlaywright();

  const runDir = path.join(baseDir, "data", "runs");
  await fs.mkdir(runDir, { recursive: true });
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const screenshotPath = path.join(runDir, `${runId}.png`);

  const browser = await pw.chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  const push = (line) => logs.push(line);

  try {
    push(`OBJETIVO: ${objective || "(não informado)"}`);
    push(`GOTO: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

    for (const step of Array.isArray(steps) ? steps : []) {
      const action = step?.action;
      if (action === "wait") {
        const ms = Math.min(Number(step?.ms || 0) || 0, 30_000);
        push(`WAIT ${ms}ms`);
        if (ms > 0) await page.waitForTimeout(ms);
        continue;
      }

      if (action === "click") {
        const selector = String(step?.selector || "");
        push(`CLICK ${selector}`);
        await page.click(selector, { timeout: 20_000 });
        continue;
      }

      if (action === "fill") {
        const selector = String(step?.selector || "");
        const text = String(step?.text ?? "");
        push(`FILL ${selector}`);
        await page.fill(selector, text, { timeout: 20_000 });
        continue;
      }

      if (action === "press") {
        const selector = String(step?.selector || "");
        const key = String(step?.key || "Enter");
        push(`PRESS ${selector} ${key}`);
        await page.press(selector, key, { timeout: 20_000 });
        continue;
      }

      if (action === "extract") {
        const selector = String(step?.selector || "body");
        push(`EXTRACT ${selector}`);
        const text = await page.locator(selector).innerText({ timeout: 20_000 });
        push(`EXTRACTED_CHARS ${String(text || "").length}`);
        continue;
      }
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const bodyText = await page.locator("body").innerText({ timeout: 20_000 });

    return {
      ok: true,
      result: [
        `URL_FINAL: ${page.url()}`,
        `SCREENSHOT: data/runs/${path.basename(screenshotPath)}`,
        "",
        "LOGS:",
        ...logs,
        "",
        "TEXTO (body):",
        truncate(bodyText, 9000),
      ].join("\n"),
    };
  } catch (err) {
    return { ok: false, result: err?.message || String(err) };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

