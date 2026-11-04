import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Octokit } from "@octokit/rest";
import {
  checkDevExperience,
  determineRequiredLanguages,
  evaluateStartEligibility,
  fetchContributorProfile,
  fetchRepositoryLanguages,
  formatEligibilityComment,
  type ContributorProfile,
  type RepositoryRequirements,
} from "../src/utils/devExperienceChecker";

describe("Dev Experience Checker", () => {
  describe("determineRequiredLanguages", () => {
    test("identifies strict domain languages (e.g. Solidity) even at low percentage", () => {
      const repo: RepositoryRequirements = {
        owner: "ubiquity",
        repo: "ubiquity-dollar",
        languages: {
          TypeScript: 90000,
          Solidity: 10000, // 10%
        },
      };
      const required = determineRequiredLanguages(repo);
      assert.ok(required.includes("Solidity"));
      assert.ok(required.includes("TypeScript"));
    });

    test("includes strict language even when below dominance threshold", () => {
      const repo: RepositoryRequirements = {
        owner: "ubiquity",
        repo: "contracts",
        languages: {
          TypeScript: 98000,
          Solidity: 2000, // ~2%
        },
      };
      const required = determineRequiredLanguages(repo);
      assert.ok(required.includes("Solidity"));
    });

    test("uses explicit requiredLanguages if supplied", () => {
      const repo: RepositoryRequirements = {
        owner: "ubiquity",
        repo: "arbitrary",
        languages: { Python: 50000 },
        requiredLanguages: ["Go", "Rust"],
      };
      const required = determineRequiredLanguages(repo);
      assert.deepEqual(required, ["Go", "Rust"]);
    });

    test("falls back to primaryLanguage if languages object is empty", () => {
      const repo: RepositoryRequirements = {
        owner: "ubiquity",
        repo: "stub",
        languages: {},
        primaryLanguage: "Solidity",
      };
      const required = determineRequiredLanguages(repo);
      assert.deepEqual(required, ["Solidity"]);
    });
  });

  describe("checkDevExperience", () => {
    const solidityRepo: RepositoryRequirements = {
      owner: "ubiquity",
      repo: "ubiquity-dollar",
      languages: { Solidity: 50000, TypeScript: 50000 },
    };

    test("passes when contributor meets repo and byte requirements", () => {
      const contributor: ContributorProfile = {
        username: "solidity-wizard",
        repositoriesCount: 15,
        languages: {
          Solidity: 25000,
          TypeScript: 40000,
        },
        languageRepoCount: {
          Solidity: 4,
          TypeScript: 8,
        },
      };

      const result = checkDevExperience(contributor, solidityRepo);
      assert.equal(result.eligible, true);
      assert.equal(result.score, 100);
      assert.equal(result.bypassed, false);
      assert.equal(result.languageMatches.Solidity.passed, true);
      assert.equal(result.languageMatches.TypeScript.passed, true);
      assert.ok(result.reason.includes("Developer experience verification passed"));
    });

    test("fails when contributor has 0 experience in a required language", () => {
      const contributor: ContributorProfile = {
        username: "frontend-only-dev",
        repositoriesCount: 20,
        languages: {
          TypeScript: 100000,
          JavaScript: 50000,
        },
        languageRepoCount: {
          TypeScript: 12,
          JavaScript: 8,
        },
      };

      const result = checkDevExperience(contributor, solidityRepo);
      assert.equal(result.eligible, false);
      assert.equal(result.languageMatches.Solidity.passed, false);
      assert.ok(result.score < 100);
      assert.ok(result.reason.includes("Solidity"));
    });

    test("fails when contributor has fewer repos than minReposPerLanguage", () => {
      const contributor: ContributorProfile = {
        username: "dabbler",
        repositoriesCount: 5,
        languages: { Solidity: 50000, TypeScript: 50000 },
        languageRepoCount: { Solidity: 1, TypeScript: 2 },
      };

      const result = checkDevExperience(contributor, solidityRepo, {
        minReposPerLanguage: 2,
      });
      assert.equal(result.eligible, false);
      assert.equal(result.languageMatches.Solidity.passed, false);
      assert.ok(result.languageMatches.Solidity.failureReason?.includes("repositories with Solidity: 1 < 2"));
    });

    test("fails when contributor has insufficient byte volume", () => {
      const contributor: ContributorProfile = {
        username: "hello-world-dev",
        repositoriesCount: 2,
        languages: { Solidity: 200, TypeScript: 50000 },
        languageRepoCount: { Solidity: 1, TypeScript: 1 },
      };

      const result = checkDevExperience(contributor, solidityRepo, {
        minBytesPerLanguage: 1000,
      });
      assert.equal(result.eligible, false);
      assert.equal(result.languageMatches.Solidity.passed, false);
      assert.ok(result.languageMatches.Solidity.failureReason?.includes("code volume for Solidity"));
    });

    test("bypasses check for whitelisted contributor", () => {
      const contributor: ContributorProfile = {
        username: "core-lead",
        repositoriesCount: 0,
        languages: {},
        languageRepoCount: {},
      };

      const result = checkDevExperience(contributor, solidityRepo, {
        whitelistedUsers: ["core-lead"],
      });
      assert.equal(result.eligible, true);
      assert.equal(result.bypassed, true);
      assert.ok(result.bypassReason?.includes("whitelisted"));
    });

    test("bypasses check for organization members", () => {
      const contributor: ContributorProfile = {
        username: "org-member",
        repositoriesCount: 0,
        languages: {},
        languageRepoCount: {},
        isOrgMember: true,
      };

      const result = checkDevExperience(contributor, solidityRepo, {
        bypassOrgMembers: true,
      });
      assert.equal(result.eligible, true);
      assert.equal(result.bypassed, true);
      assert.ok(result.bypassReason?.includes("organization member"));
    });

    test("passes automatically when repository has no language requirements", () => {
      const contributor: ContributorProfile = {
        username: "writer",
        repositoriesCount: 0,
        languages: {},
        languageRepoCount: {},
      };
      const emptyRepo: RepositoryRequirements = {
        owner: "ubiquity",
        repo: "docs",
        languages: {},
      };

      const result = checkDevExperience(contributor, emptyRepo);
      assert.equal(result.eligible, true);
      assert.ok(result.reason.includes("No specific programming language experience is mandated"));
    });
  });

  describe("formatEligibilityComment", () => {
    test("formats passed eligibility comment", () => {
      const comment = formatEligibilityComment({
        eligible: true,
        username: "alice",
        score: 100,
        bypassed: false,
        requiredLanguages: ["Solidity"],
        languageMatches: {
          Solidity: {
            language: "Solidity",
            required: true,
            userBytes: 15000,
            userRepos: 3,
            repoBytes: 40000,
            passed: true,
          },
        },
        reason: "Passed",
        warnings: [],
      });

      assert.ok(comment.includes("Developer Experience Verified"));
      assert.ok(comment.includes("@alice"));
      assert.ok(comment.includes("Passed (3 repos, 15,000 bytes)"));
    });

    test("formats ineligible comment with failure details", () => {
      const comment = formatEligibilityComment({
        eligible: false,
        username: "bob",
        score: 0,
        bypassed: false,
        requiredLanguages: ["Solidity"],
        languageMatches: {
          Solidity: {
            language: "Solidity",
            required: true,
            userBytes: 0,
            userRepos: 0,
            repoBytes: 40000,
            passed: false,
            failureReason: "repositories with Solidity: 0 < 1",
          },
        },
        reason: "Failed",
        warnings: [],
      });

      assert.ok(comment.includes("Experience Check Failed"));
      assert.ok(comment.includes("@bob"));
      assert.ok(comment.includes("Ineligible — repositories with Solidity: 0 < 1"));
    });

    test("formats bypassed comment for exempt contributor", () => {
      const comment = formatEligibilityComment({
        eligible: true,
        username: "charlie",
        score: 100,
        bypassed: true,
        bypassReason: "Authorized team lead",
        requiredLanguages: [],
        languageMatches: {},
        reason: "Bypassed",
        warnings: [],
      });

      assert.ok(comment.includes("exempt from experience verification"));
      assert.ok(comment.includes("Authorized team lead"));
    });
  });

  describe("API integration helpers with mock Octokit", () => {
    test("fetchRepositoryLanguages parses API response", async () => {
      const mockOctokit = {
        rest: {
          repos: {
            listLanguages: async () => ({
              data: { Solidity: 12345, TypeScript: 67890 },
            }),
          },
        },
      } as unknown as Octokit;

      const langs = await fetchRepositoryLanguages(mockOctokit, "ubiquity", "ubiquity-dollar");
      assert.equal(langs.Solidity, 12345);
      assert.equal(langs.TypeScript, 67890);
    });

    test("fetchContributorProfile aggregates repos and languages", async () => {
      const mockOctokit = {
        rest: {
          repos: {
            listForUser: async () => ({
              data: [
                { name: "sol-vault", language: "Solidity", size: 50 },
                { name: "sol-nft", language: "Solidity", size: 30 },
                { name: "ts-bot", language: "TypeScript", size: 100 },
              ],
            }),
          },
          orgs: {
            checkMembershipForUser: async () => ({ status: 404 }),
          },
        },
      } as unknown as Octokit;

      const profile = await fetchContributorProfile(mockOctokit, "eth-dev", {
        orgToCheck: "ubiquity",
      });

      assert.equal(profile.username, "eth-dev");
      assert.equal(profile.repositoriesCount, 3);
      assert.equal(profile.languageRepoCount.Solidity, 2);
      assert.equal(profile.languageRepoCount.TypeScript, 1);
      assert.equal(profile.languages.Solidity, (50 + 30) * 1024);
      assert.equal(profile.isOrgMember, false);
    });

    test("evaluateStartEligibility conducts end-to-end evaluation", async () => {
      const mockOctokit = {
        rest: {
          repos: {
            listLanguages: async () => ({
              data: { Solidity: 25000, TypeScript: 25000 },
            }),
            listForUser: async () => ({
              data: [
                { name: "sol-token", language: "Solidity", size: 40 },
                { name: "react-app", language: "TypeScript", size: 80 },
              ],
            }),
          },
          orgs: {
            checkMembershipForUser: async () => ({ status: 404 }),
          },
        },
      } as unknown as Octokit;

      const result = await evaluateStartEligibility(mockOctokit, {
        username: "pro-coder",
        owner: "ubiquity",
        repo: "ubiquity-dollar",
      });

      assert.equal(result.eligible, true);
      assert.equal(result.score, 100);
      assert.equal(result.languageMatches.Solidity.passed, true);
      assert.equal(result.languageMatches.TypeScript.passed, true);
    });
  });
});
