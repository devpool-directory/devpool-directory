import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["build/index.ts", ".github/empty-string-checker.ts"],
  project: ["src/**/*.ts", ".github/**/*.ts"],
  ignore: ["src/types/config.ts", "**/__mocks__/**", "**/__fixtures__/**", "src/directory/set-state-changes.ts"],
  ignoreExportsUsedInFile: true,
  // eslint can also be safely ignored as per the docs: https://knip.dev/guides/handling-issues#eslint--jest
  ignoreDependencies: [
    "eslint-config-prettier", 
    "eslint-plugin-prettier", 
    "@types/jest",
    "@commitlint/cli",
    "@octokit/types",
    "@types/twitter",
    "esbuild",
    "lint-staged",
    "@jest/globals",
    "@octokit/plugin-rest-endpoint-methods",
    "@actions/core",
    "simple-git",
    "@cspell/dict-node",
    "@cspell/dict-software-terms",
    "@cspell/dict-typescript"
  ],
  ignoreBinaries: ["format:cspell"],
  eslint: true,
};

export default config;
