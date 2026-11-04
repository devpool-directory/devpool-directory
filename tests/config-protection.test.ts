import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AuthorPermission,
  ConfigProtectionOptions,
  DEFAULT_AUTHORIZED_ROLES,
  DEFAULT_PROTECTED_CONFIG_PATTERNS,
  DEFAULT_TRUSTED_BOTS,
  evaluatePushPayload,
  filterProtectedFiles,
  formatFraudAlertMarkdown,
  generateRevertPlan,
  inspectConfigModification,
  isProtectedConfigPath,
  isUserAuthorizedForConfigChange,
  normalizeConfigPath,
  PushWebhookPayload,
} from "../src/utils/configProtection";

describe("Config Protection Utility (#5034)", () => {
  describe("normalizeConfigPath", () => {
    it("handles leading/trailing slashes and normalizes separators", () => {
      assert.equal(normalizeConfigPath("/.github/.ubiquity-os.config.yml"), ".github/.ubiquity-os.config.yml");
      assert.equal(normalizeConfigPath("///config/devpool.config.json///"), "config/devpool.config.json");
      assert.equal(normalizeConfigPath(".\\config\\devpool.config.json"), "config/devpool.config.json");
    });

    it("converts paths to lowercase", () => {
      assert.equal(normalizeConfigPath(".GITHUB/.UBIQUITY-OS.CONFIG.YML"), ".github/.ubiquity-os.config.yml");
    });

    it("handles empty or invalid inputs gracefully", () => {
      assert.equal(normalizeConfigPath(""), "");
      assert.equal(normalizeConfigPath(null as unknown as string), "");
    });
  });

  describe("isProtectedConfigPath", () => {
    it("identifies standard default protected config files", () => {
      for (const pattern of DEFAULT_PROTECTED_CONFIG_PATTERNS) {
        assert.equal(isProtectedConfigPath(pattern), true, `Expected ${pattern} to be protected`);
      }
    });

    it("matches paths case-insensitively and with leading slashes", () => {
      assert.equal(isProtectedConfigPath("/.ubiquity-os.config.yml"), true);
      assert.equal(isProtectedConfigPath(".UBIQUITY-OS.CONFIG.YAML"), true);
      assert.equal(isProtectedConfigPath("/.github/.ubiquity-os.config.yml"), true);
      assert.equal(isProtectedConfigPath("config/devpool.config.json"), true);
    });

    it("does not match unrelated repository source files or docs", () => {
      assert.equal(isProtectedConfigPath("src/main.ts"), false);
      assert.equal(isProtectedConfigPath("README.md"), false);
      assert.equal(isProtectedConfigPath("tests/helpers.test.ts"), false);
      assert.equal(isProtectedConfigPath("docs/configuration.md"), false);
      assert.equal(isProtectedConfigPath("src/config/load.ts"), false);
    });

    it("supports custom protected file patterns", () => {
      const custom = ["custom/governance.json", "billing-rates.yml"];
      assert.equal(isProtectedConfigPath("custom/governance.json", custom), true);
      assert.equal(isProtectedConfigPath("billing-rates.yml", custom), true);
      assert.equal(isProtectedConfigPath(".ubiquity-os.config.yml", custom), false);
    });

    it("returns false for invalid inputs", () => {
      assert.equal(isProtectedConfigPath(""), false);
      assert.equal(isProtectedConfigPath(undefined as unknown as string), false);
    });
  });

  describe("filterProtectedFiles", () => {
    it("extracts and deduplicates protected config paths from file list", () => {
      const input = [
        "src/cli/sync.ts",
        ".ubiquity-os.config.yml",
        "README.md",
        "/.ubiquity-os.config.yml",
        "config/devpool.config.json",
        "src/utils/calc.ts",
      ];
      const result = filterProtectedFiles(input);
      assert.equal(result.length, 2);
      assert.ok(result.includes(".ubiquity-os.config.yml"));
      assert.ok(result.includes("config/devpool.config.json"));
    });

    it("returns empty array when no files are protected or input is invalid", () => {
      assert.deepEqual(filterProtectedFiles(["src/index.ts", "package.json"]), []);
      assert.deepEqual(filterProtectedFiles([]), []);
      assert.deepEqual(filterProtectedFiles(null as unknown as string[]), []);
    });
  });

  describe("isUserAuthorizedForConfigChange", () => {
    it("authorizes default trusted bot accounts", () => {
      for (const bot of DEFAULT_TRUSTED_BOTS) {
        assert.equal(isUserAuthorizedForConfigChange({ login: bot }), true, `Expected bot ${bot} to be authorized`);
      }
      assert.equal(isUserAuthorizedForConfigChange({ login: "random-bot", isBot: true }), true);
    });

    it("authorizes explicit allowedLogins whitelist", () => {
      const options: ConfigProtectionOptions = {
        allowedLogins: ["trustedAuditor", "financeLead"],
      };
      assert.equal(isUserAuthorizedForConfigChange({ login: "trustedAuditor" }, options), true);
      assert.equal(isUserAuthorizedForConfigChange({ login: "financelead" }, options), true);
      assert.equal(isUserAuthorizedForConfigChange({ login: "unauthorizedUser" }, options), false);
    });

    it("authorizes explicit billing manager or org admin flags", () => {
      assert.equal(isUserAuthorizedForConfigChange({ login: "treasurer", isBillingManager: true }), true);
      assert.equal(isUserAuthorizedForConfigChange({ login: "orgOwner", isOrgAdmin: true }), true);
    });

    it("authorizes users with admin, billing_manager, or owner roles", () => {
      for (const role of DEFAULT_AUTHORIZED_ROLES) {
        assert.equal(
          isUserAuthorizedForConfigChange({ login: "teamMember", role }),
          true,
          `Expected role ${role} to be authorized`
        );
      }
    });

    it("authorizes users with permissions.admin = true", () => {
      assert.equal(
        isUserAuthorizedForConfigChange({ login: "repoAdmin", permissions: { admin: true } }),
        true
      );
    });

    it("rejects unauthorized roles like read, triage, or write (without admin)", () => {
      assert.equal(isUserAuthorizedForConfigChange({ login: "contributor", role: "read" }), false);
      assert.equal(isUserAuthorizedForConfigChange({ login: "triager", role: "triage" }), false);
      assert.equal(isUserAuthorizedForConfigChange({ login: "committer", role: "write" }), false);
      assert.equal(
        isUserAuthorizedForConfigChange({ login: "dev", permissions: { push: true, pull: true, admin: false } }),
        false
      );
    });

    it("rejects empty or missing author", () => {
      assert.equal(isUserAuthorizedForConfigChange({ login: "" }), false);
      assert.equal(isUserAuthorizedForConfigChange(null as unknown as AuthorPermission), false);
    });
  });

  describe("inspectConfigModification", () => {
    it("returns 'safe' when no protected configuration files are touched", () => {
      const result = inspectConfigModification({
        author: { login: "externalContributor", role: "read" },
        changedFiles: ["src/index.ts", "README.md", "tests/foo.test.ts"],
      });
      assert.equal(result.status, "safe");
      assert.equal(result.isProtectedFileModified, false);
      assert.equal(result.isAuthorized, true);
      assert.equal(result.violatingFiles.length, 0);
    });

    it("returns 'authorized' when an admin or billing_manager touches protected config", () => {
      const result = inspectConfigModification({
        author: { login: "projectLead", role: "admin" },
        changedFiles: [".ubiquity-os.config.yml", "src/index.ts"],
      });
      assert.equal(result.status, "authorized");
      assert.equal(result.isProtectedFileModified, true);
      assert.equal(result.isAuthorized, true);
      assert.equal(result.violatingFiles.length, 0);
      assert.deepEqual(result.protectedFilesDetected, [".ubiquity-os.config.yml"]);
    });

    it("returns 'unauthorized_modification' when an unauthorized contributor touches protected config", () => {
      const result = inspectConfigModification({
        author: { login: "maliciousActor", role: "none" },
        changedFiles: [
          "src/utils/calc.ts",
          ".ubiquity-os.config.yml",
          "config/devpool.config.json",
        ],
      });
      assert.equal(result.status, "unauthorized_modification");
      assert.equal(result.isProtectedFileModified, true);
      assert.equal(result.isAuthorized, false);
      assert.equal(result.author, "maliciousActor");
      assert.equal(result.violatingFiles.length, 2);
      assert.ok(result.violatingFiles.includes(".ubiquity-os.config.yml"));
      assert.ok(result.violatingFiles.includes("config/devpool.config.json"));
      assert.match(result.reason, /Unauthorized config modification detected/);
    });
  });

  describe("generateRevertPlan", () => {
    it("returns no-op plan when change is authorized or safe", () => {
      const safeEval = inspectConfigModification({
        author: { login: "alice", role: "admin" },
        changedFiles: [".ubiquity-os.config.yml"],
      });
      const plan = generateRevertPlan({ evaluation: safeEval });
      assert.equal(plan.shouldRevert, false);
      assert.equal(plan.filesToRestore.length, 0);
      assert.equal(plan.alertComment, "");
    });

    it("generates complete revert plan for unauthorized config tampering", () => {
      const badEval = inspectConfigModification({
        author: { login: "attacker", role: "none" },
        changedFiles: [".ubiquity-os.config.yml", "config/devpool.config.json"],
      });
      const plan = generateRevertPlan({
        evaluation: badEval,
        targetBranch: "main",
        fileChanges: [
          {
            filename: ".ubiquity-os.config.yml",
            status: "modified",
            previousContent: "original_config: true\n",
          },
          {
            filename: "config/devpool.config.json",
            status: "added",
          },
        ],
        context: {
          repo: "ubiquity-os/test-repo",
          commitSha: "abc1234567890",
          prNumber: 42,
        },
      });

      assert.equal(plan.shouldRevert, true);
      assert.equal(plan.targetBranch, "main");
      assert.equal(plan.revertAuthor.name, "UbiquiBot");
      assert.match(plan.commitMessage, /revert: rollback unauthorized modification/);
      assert.match(plan.commitMessage, /@attacker/);
      assert.match(plan.commitMessage, /#5034/);

      assert.equal(plan.filesToRestore.length, 2);

      const modifiedTarget = plan.filesToRestore.find((f) => f.path === ".ubiquity-os.config.yml");
      assert.ok(modifiedTarget);
      assert.equal(modifiedTarget.action, "restore");
      assert.equal(modifiedTarget.restoreContent, "original_config: true\n");

      const addedTarget = plan.filesToRestore.find((f) => f.path === "config/devpool.config.json");
      assert.ok(addedTarget);
      assert.equal(addedTarget.action, "delete");
      assert.equal(addedTarget.restoreContent, null);

      assert.match(plan.alertComment, /> \[\!WARNING\]/);
      assert.match(plan.alertComment, /@attacker/);
      assert.match(plan.alertComment, /abc1234/);
      assert.match(plan.alertComment, /#42/);
    });
  });

  describe("formatFraudAlertMarkdown", () => {
    it("formats markdown with warning banner, author, and violating files", () => {
      const evaluation = inspectConfigModification({
        author: { login: "attacker" },
        changedFiles: [".ubiquity-os.config.yml"],
      });
      const alert = formatFraudAlertMarkdown(evaluation, {
        commitSha: "deadbeefcafe",
        prNumber: 88,
      });

      assert.match(alert, /> \[\!WARNING\]/);
      assert.match(alert, /\*\*Author:\*\* @attacker/);
      assert.match(alert, /- `\.ubiquity-os\.config\.yml`/);
      assert.match(alert, /commit `deadbee`/);
      assert.match(alert, /pull request #88/);
      assert.match(alert, /admin/);
      assert.match(alert, /billing_manager/);
    });
  });

  describe("evaluatePushPayload", () => {
    it("evaluates push webhook payload and identifies unauthorized config modifications across commits", async () => {
      const payload: PushWebhookPayload = {
        ref: "refs/heads/development",
        after: "f00ba42c0ffee",
        repository: {
          full_name: "devpool-directory/devpool-directory",
          default_branch: "development",
        },
        sender: {
          login: "unauthorizedContributor",
        },
        commits: [
          {
            id: "commit1",
            modified: ["src/helper.ts"],
          },
          {
            id: "commit2",
            modified: [".ubiquity-os.config.yml"],
          },
        ],
      };

      const { evaluation, revertPlan } = await evaluatePushPayload(
        payload,
        async (login) => ({
          login,
          role: "write",
        })
      );

      assert.equal(evaluation.status, "unauthorized_modification");
      assert.equal(evaluation.violatingFiles.length, 1);
      assert.equal(evaluation.violatingFiles[0], ".ubiquity-os.config.yml");
      assert.equal(revertPlan.shouldRevert, true);
      assert.equal(revertPlan.targetBranch, "development");
    });

    it("permits push payload when author is billing_manager", async () => {
      const payload: PushWebhookPayload = {
        ref: "refs/heads/development",
        sender: { login: "financeAdmin" },
        commits: [
          {
            id: "commit1",
            modified: [".ubiquity-os.config.yml"],
          },
        ],
      };

      const { evaluation, revertPlan } = await evaluatePushPayload(
        payload,
        async (login) => ({
          login,
          isBillingManager: true,
        })
      );

      assert.equal(evaluation.status, "authorized");
      assert.equal(revertPlan.shouldRevert, false);
    });
  });
});
