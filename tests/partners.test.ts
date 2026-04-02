import { describe, test, expect } from "@jest/globals";
import { PARTNER_PRESETS, resolvePartners } from "../src/config/partners";

describe("Partner presets", () => {
  test("ubiquity preset has expected shape", () => {
    const p = PARTNER_PRESETS["ubiquity"];
    expect(p).toBeDefined();
    expect(p.include).toContain("ubiquity");
    expect(p.exclude).toContain("ubiquity/series-a");
    expect(p.exclude).toContain("ubiquity/hackbar");
    expect(p.exclude).toContain("ubiquity/ubiquibot");
    expect(p.exclude).toContain("ubiquity/ubiquibot-telegram");
    expect(Array.isArray(p.include)).toBe(true);
    expect(Array.isArray(p.exclude)).toBe(true);
    expect(Array.isArray(p.explicit_urls)).toBe(true);
  });

  test("resolvePartners merges multiple partner presets", () => {
    const resolved = resolvePartners(["ubiquity", "ubiquity-os"]);
    expect(resolved.include).toContain("ubiquity");
    expect(resolved.include).toContain("ubiquity-os");
    expect(resolved.exclude).toContain("ubiquity/series-a");
    expect(resolved.exclude).toContain("ubiquity/hackbar");
  });

  test("resolvePartners handles unknown partner IDs gracefully", () => {
    const resolved = resolvePartners(["ubiquity", "nonexistent-partner"]);
    expect(resolved.include).toContain("ubiquity");
    expect(resolved.include).not.toContain("nonexistent-partner");
  });

  test("resolvePartners returns empty arrays for empty input", () => {
    const resolved = resolvePartners([]);
    expect(resolved.include).toEqual([]);
    expect(resolved.exclude).toEqual([]);
    expect(resolved.explicit_urls).toEqual([]);
  });
});
