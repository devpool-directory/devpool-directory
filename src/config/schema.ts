import { z } from "zod";

/** Permit generation configuration for automatic transfers. */
export const PermitGenerationSchema = z.object({
  /** Enable automatic transfer of funds when issues are completed. */
  transfer: z.boolean().default(false),
  /** URL of the permit generation service. Defaults to Ubiquity's permit service. */
  permit_url: z.string().url().default("https://pay.ubq.fi"),
  /** Wallet private key for signing transfers (encrypted). Stored in secrets, not config. */
  evm_private_key_env: z.string().default("EVT_PRIVATE_KEY"),
});

export type PermitGenerationConfig = z.infer<typeof PermitGenerationSchema>;

export const ConfigSchema = z.object({
  /** Partner preset IDs (keys of PARTNER_PRESETS). Resolved before include/exclude. */
  partners: z.array(z.string()).default([]),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  explicit_urls: z.array(z.string()).default([]),
  data_branch: z.string().default("__STORAGE__"),
  max_shards: z.number().int().positive().default(8),
  /** Permit generation settings for automatic transfers. */
  permit_generation: PermitGenerationSchema.default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
