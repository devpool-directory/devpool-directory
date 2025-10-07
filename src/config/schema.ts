import { z } from "zod";

export const ConfigSchema = z.object({
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  explicit_urls: z.array(z.string()).default([]),
  categories: z.record(z.string()).default({}),
  official_owners: z.array(z.string()).default([]),
  data_branch: z.string().default("__STORAGE__"),
  max_shards: z.number().int().positive().default(8)
});

export type AppConfig = z.infer<typeof ConfigSchema>;

