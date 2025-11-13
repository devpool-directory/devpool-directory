import fs from "node:fs";
import path from "node:path";

export function writeJson(outDir: string, file: string, data: unknown) {
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, file);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
