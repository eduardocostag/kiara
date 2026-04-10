import fs from "fs/promises";
import path from "path";

export function createLocalJsonlStore({ baseDir, filename }) {
  const filePath = path.join(baseDir, filename);

  async function ensureDir() {
    await fs.mkdir(baseDir, { recursive: true });
  }

  async function append(item) {
    await ensureDir();
    const line = `${JSON.stringify(item)}\n`;
    await fs.appendFile(filePath, line, "utf8");
  }

  async function readAll({ maxLines = 500 } = {}) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const lines = text.split("\n").filter(Boolean);
      return lines.slice(-maxLines).map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch (err) {
      if (err && err.code === "ENOENT") return [];
      throw err;
    }
  }

  return { filePath, append, readAll };
}

