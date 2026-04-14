import fs from "fs/promises";
import path from "path";

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "non-serializable" });
  }
}

export function createLogger({ baseDir }) {
  const logDir = path.join(baseDir, "data", "logs");
  const logFile = path.join(logDir, "kiara-debug.log");

  async function write(level, event, payload = {}) {
    const line = [
      new Date().toISOString(),
      level.toUpperCase(),
      event,
      safeJson(payload),
    ].join(" | ");

    try {
      await fs.mkdir(logDir, { recursive: true });
      await fs.appendFile(logFile, line + "\n", "utf8");
    } catch {
      // best effort
    }
  }

  return {
    logFile,
    info(event, payload) {
      return write("info", event, payload);
    },
    error(event, payload) {
      return write("error", event, payload);
    },
  };
}
