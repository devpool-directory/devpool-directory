/**
 * Fast wiring checks for bounty #5931 verify (no forge required).
 * Agent VERIFY_COMMAND uses npm test → meta + verify:bounty-5931.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const scripts = pkg.scripts ?? {};

const required = ["build", "test", "verify", "verify:bounty-5931"];
for (const key of required) {
  if (!scripts[key]) {
    console.error(`missing package.json script: ${key}`);
    process.exit(1);
  }
}

if (!/verify/.test(scripts.test)) {
  console.error("package.json test must route to bounty verify (agent VERIFY_COMMAND)");
  process.exit(1);
}

const patch = join(root, "partner-deliverables/5931-liquity-sp/ubiquity-dollar-997.patch");
if (!existsSync(patch) || readFileSync(patch, "utf8").length < 1000) {
  console.error("missing or too small partner patch:", patch);
  process.exit(1);
}

const verifySh = readFileSync(join(root, "scripts/verify-bounty-5931.sh"), "utf8");
if (!verifySh.includes("ensure_patch_applied") && !verifySh.includes("patch_applied")) {
  console.error("verify-bounty-5931.sh missing patch-apply guard");
  process.exit(1);
}

const proof = join(root, "partner-deliverables/5931-liquity-sp/stability-pool-forge-test.txt");
if (!existsSync(proof)) {
  console.error("missing stability-pool-forge-test.txt proof artifact");
  process.exit(1);
}

console.log("OK: bounty-5931 verify wiring meta checks passed");
