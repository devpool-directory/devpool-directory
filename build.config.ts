import { BuildOptions } from 'esbuild';

const config: BuildOptions = {
  entryPoints: ['./src/presentation/cli/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: './dist/index.js',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  external: [
    'dotenv',
    '@octokit/rest',
    'winston',
    'inversify',
    'reflect-metadata',
    'zod',
    'commander'
  ],
  loader: {
    '.ts': 'ts',
    '.json': 'json'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
};

export default config;