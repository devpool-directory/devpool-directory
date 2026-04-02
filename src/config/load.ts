import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ConfigSchema, type AppConfig } from "./schema";
import { resolvePartners } from "./partners";

dotenv.config();

export function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH ?? path.join(process.cwd(), "config", "devpool.config.json");
  const raw = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid configuration: ${parsed.error.message}`);

  // Resolve partner presets and merge with explicit include/exclude/urls
  const partnerResolved = resolvePartners(parsed.data.partners);
  const config: AppConfig = {
    partners: parsed.data.partners,
    // Partner includes come first; explicit include entries are appended
    include: [...partnerResolved.include, ...parsed.data.include],
    // Explicit excludes are appended to partner excludes
    exclude: [...partnerResolved.exclude, ...parsed.data.exclude],
    // Same for explicit_urls
    explicit_urls: [...partnerResolved.explicit_urls, ...parsed.data.explicit_urls],
    data_branch: parsed.data.data_branch,
    max_shards: parsed.data.max_shards,
    permit_generation: parsed.data.permit_generation,
  };

  return config;
}

export function env(name: string, required = false): string | undefined {
  const val = process.env[name];
  if (required && !val) throw new Error(`Missing required env: ${name}`);
  return val;
}
