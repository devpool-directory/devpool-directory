import { z } from "zod";

export const PermitGenerationSchema = z.object({
  transfer: z.boolean().default(false),
  permit_url: z.string().url().default("https://pay.ubq.fi"),
  evm_private_key_env: z.string().default("EVT_PRIVATE_KEY"),
});

export type PermitGenerationConfig = z.infer<typeof PermitGenerationSchema>;

export const ConfigSchema = z.object({
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  explicit_urls: z.array(z.string()).default([]),
  data_branch: z.string().default("__STORAGE__"),
  max_shards: z.number().int().positive().default(8),
  permit_generation: PermitGenerationSchema.default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
