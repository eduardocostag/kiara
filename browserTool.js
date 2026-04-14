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
    const err = new Error('Playwright nao instalado (rode "npm i playwright")');
    err.code = "KIARA_NO_PLAYWRIGHT";
    throw err;
  }
}

async function waitForMaybe(page, selector, timeout = 12000) {
  if (!selector) return;
  await page.waitForSelector(selector, { timeout, state: "visible" });
}

async function withRetries(fn, { retries = 2, onRetry }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      if (onRetry) await onRetry(err, attempt + 1);
    }
  }
  throw lastError;
}

async function runStep(page, step, push) {
  const action = step?.action;
  const selector = String(step?.selector || "");
  const fallbackSelector = String(step?.fallbackSelector || "");
  const timeout = Math.min(Number(step?.timeout || 12000) || 12000, 30000);

  if (action === "wait") {
    const ms = Math.min(Number(step?.ms || 0) || 0, 30000);
    push(`WAIT ${ms}ms`);
    if (ms > 0) await page.waitForTimeout(ms);
    return;
  }

  if (action === "goto") {
    const gotoUrl = String(step?.url || "");
    push(`GOTO_STEP ${gotoUrl}`);
    await page.goto(gotoUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    return;
  }

  if (action === "click") {
    push(`CLICK ${selector || fallbackSelector}`);
    await withRetries(
      async () => {
        await waitForMaybe(page, selector || fallbackSelector, timeout);
        const target = selector || fallbackSelector;
        await page.click(target, { timeout });
      },
      {
        retries: 2,
        onRetry: async (err, retry) => {
          push(`RETRY_CLICK ${retry} ${err?.message || err}`);
          if (fallbackSelector) {
            try {
              await page.click(fallbackSelector, { timeout: Math.max(5000, timeout / 2) });
              return;
            } catch {
              // keep retrying normally
            }
          }
          await page.waitForTimeout(800);
        },
      },
    );
    return;
  }

  if (action === "fill") {
    const text = String(step?.text ?? "");
    push(`FILL ${selector || fallbackSelector}`);
    await withRetries(
      async () => {
        await waitForMaybe(page, selector || fallbackSelector, timeout);
        const target = selector || fallbackSelector;
        await page.fill(target, text, { timeout });
      },
      {
        retries: 2,
        onRetry: async (err, retry) => {
          push(`RETRY_FILL ${retry} ${err?.message || err}`);
          await page.waitForTimeout(600);
        },
      },
    );
    return;
  }

  if (action === "press") {
    const key = String(step?.key || "Enter");
    push(`PRESS ${selector || fallbackSelector} ${key}`);
    await withRetries(
      async () => {
        await waitForMaybe(page, selector || fallbackSelector, timeout);
        const target = selector || fallbackSelector;
        await page.press(target, key, { timeout });
      },
      {
        retries: 1,
        onRetry: async (err, retry) => {
          push(`RETRY_PRESS ${retry} ${err?.message || err}`);
          await page.waitForTimeout(500);
        },
      },
    );
    return;
  }

  if (action === "extract") {
    const target = selector || "body";
    push(`EXTRACT ${target}`);
    const text = await withRetries(
      async () => {
        await waitForMaybe(page, target, timeout);
        return page.locator(target).innerText({ timeout });
      },
      {
        retries: 1,
        onRetry: async (err, retry) => {
          push(`RETRY_EXTRACT ${retry} ${err?.message || err}`);
          await page.waitForTimeout(500);
        },
      },
    );
    push(`EXTRACTED_CHARS ${String(text || "").length}`);
    return;
  }

  if (action === "wait_for") {
    const target = selector || fallbackSelector;
    push(`WAIT_FOR ${target}`);
    await waitForMaybe(page, target, timeout);
    return;
  }

  throw new Error(`Acao de browser nao suportada: ${action}`);
}

export async function runBrowserTask({ baseDir, url, steps = [], objective, headless = true }) {
  if (process.env.KIARA_ENABLE_PLAYWRIGHT !== "1") {
    return { ok: false, result: "Playwright desativado (set KIARA_ENABLE_PLAYWRIGHT=1)" };
  }

  const targetUrl = String(url || "");
  if (!isHttpUrl(targetUrl)) return { ok: false, result: "URL invalida" };
  if (!domainAllowed(targetUrl)) {
    return {
      ok: false,
      result: "Dominio nao permitido (defina KIARA_ALLOWED_DOMAINS ou KIARA_ALLOW_ANY_DOMAIN=1)",
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
    push(`OBJETIVO: ${objective || "(nao informado)"}`);
    push(`GOTO: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    for (const [index, step] of (Array.isArray(steps) ? steps : []).entries()) {
      try {
        push(`STEP ${index + 1}: ${step?.action || "(desconhecida)"}`);
        await runStep(page, step, push);
      } catch (err) {
        push(`STEP_ERROR ${index + 1}: ${err?.message || err}`);
        if (step?.optional) {
          push(`STEP_OPTIONAL_SKIP ${index + 1}`);
          continue;
        }

        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        const bodyText = await page.locator("body").innerText({ timeout: 8000 }).catch(() => "");
        return {
          ok: false,
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
      }
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const bodyText = await page.locator("body").innerText({ timeout: 20000 });

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
