import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/plan': 'src/cli/plan.ts',
    'bin/sync-shard': 'src/cli/sync-shard.ts',
    'bin/aggregate': 'src/cli/aggregate.ts',
    'bin/summary': 'src/cli/summary.ts',
    'bin/backfill': 'src/cli/backfill.ts',
    'bin/cleanup': 'src/cli/cleanup.ts',
    'bin/twitter-plan': 'src/cli/twitter-plan.ts',
    'bin/twitter-apply': 'src/cli/twitter-apply.ts',
    'bin/twitter-audit': 'src/cli/twitter-audit.ts',
  },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  minify: false,
  bundle: true,
  treeshake: true,
  splitting: false,
  dts: false,
  noExternal: [
    '@octokit/rest',
    '@octokit/graphql',
    'twitter-api-v2',
    'p-limit',
    'zod',
    'dotenv',
  ],
});
