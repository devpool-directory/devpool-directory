import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ConfigSchema, type AppConfig } from "./schema";

dotenv.config();

export function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH ?? path.join(process.cwd(), "config", "devpool.config.json");
  const raw = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid configuration: ${parsed.error.message}`);
  return parsed.data;
}

export function env(name: string, required = false): string | undefined {
  const val = process.env[name];
  if (required && !val) throw new Error(`Missing required env: ${name}`);
  return val;
}
