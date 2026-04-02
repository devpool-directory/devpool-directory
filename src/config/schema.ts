import { z } from "zod";

export const ConfigSchema = z.object({
  /** Partner preset IDs (keys of PARTNER_PRESETS). Resolved before include/exclude. */
  partners: z.array(z.string()).default([]),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  explicit_urls: z.array(z.string()).default([]),
  data_branch: z.string().default("__STORAGE__"),
  max_shards: z.number().int().positive().default(8),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
