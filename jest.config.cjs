/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          moduleResolution: "Bundler",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          types: ["node", "jest"],
        },
      },
    ],
  },
  testMatch: ["<rootDir>/tests/permit-generation.test.ts", "<rootDir>/tests/automatic-transfer.test.ts"],
};
