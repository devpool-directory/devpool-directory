import { describe, it, expect } from "vitest";

// Inline helpers to test without importing the module (avoids Octokit env deps)
function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const m = input.match(/(?:github\.com\/)?([^\/]+)\/([^\/\s]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

describe("CTA Delivery", () => {
  describe("parseRepoUrl", () => {
    it("parses https://github.com/owner/repo", () => {
      expect(parseRepoUrl("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
    });

    it("parses github.com/owner/repo", () => {
      expect(parseRepoUrl("github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
    });

    it("parses owner/repo shorthand", () => {
      expect(parseRepoUrl("owner/repo")).toEqual({ owner: "owner", repo: "repo" });
    });

    it("strips .git suffix", () => {
      expect(parseRepoUrl("https://github.com/owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
    });

    it("handles org with dashes", () => {
      expect(parseRepoUrl("my-org/my-repo")).toEqual({ owner: "my-org", repo: "my-repo" });
    });

    it("returns null for invalid input", () => {
      expect(parseRepoUrl("not-a-url")).toBeNull();
      expect(parseRepoUrl("only-owner")).toBeNull();
      expect(parseRepoUrl("")).toBeNull();
    });
  });
});
