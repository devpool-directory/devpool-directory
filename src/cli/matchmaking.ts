/**
 * CLI: Generate the Matchmaking UI HTML page.
 * Usage: npm run build && node dist/cli/matchmaking.js
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateMatchmakingPage } from "../matchmaking/index.js";

const outPath = resolve(process.argv[2] ?? "matchmaking.html");
const html = generateMatchmakingPage();
writeFileSync(outPath, html, "utf-8");
console.log(`✅ Matchmaking UI written to ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
