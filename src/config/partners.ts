/**
 * Predefined partner configurations.
 * Partners can be referenced by ID instead of configuring include/exclude manually.
 * Usage: add partner IDs to the `partners` array in devpool.config.json.
 */

export interface PartnerPreset {
  /** Org or repo strings to include (same semantics as top-level `include`). */
  include: string[];
  /** Org or repo strings to exclude. */
  exclude: string[];
  /** Explicit repo URLs to include. */
  explicit_urls: string[];
}

/**
 * Registry of premade partner configurations.
 * Key is the partner ID used in the `partners` config array.
 */
export const PARTNER_PRESETS: Record<string, PartnerPreset> = {
  ubiquity: {
    include: ["ubiquity"],
    exclude: [
      "ubiquity/series-a",
      "ubiquity/hackbar",
      "ubiquity/card-issuance",
      "ubiquity/research",
      "ubiquity/recruiting",
      "ubiquity/ubiquibar",
      "ubiquity/ubiquibot",
      "ubiquity/ubiquibot-telegram",
    ],
    explicit_urls: [],
  },
  "ubiquity-os": {
    include: ["ubiquity-os"],
    exclude: [],
    explicit_urls: [],
  },
  "0x4007": {
    include: ["0x4007"],
    exclude: [],
    explicit_urls: [],
  },
  ondecentral: {
    include: ["ondecentral"],
    exclude: [],
    explicit_urls: [],
  },
  "devpool-directory": {
    include: ["devpool-directory"],
    exclude: [],
    explicit_urls: [],
  },
  askmiguel: {
    include: ["askmiguel"],
    exclude: [],
    explicit_urls: [],
  },
};

/**
 * Resolve a list of partner IDs to their merged include/exclude/explicit_urls.
 * Later partners override earlier ones for overlapping keys.
 */
export function resolvePartners(partnerIds: string[]): {
  include: string[];
  exclude: string[];
  explicit_urls: string[];
} {
  const merged = { include: [] as string[], exclude: [] as string[], explicit_urls: [] as string[] };
  for (const id of partnerIds) {
    const preset = PARTNER_PRESETS[id];
    if (!preset) continue;
    merged.include.push(...preset.include);
    merged.exclude.push(...preset.exclude);
    merged.explicit_urls.push(...preset.explicit_urls);
  }
  return merged;
}
