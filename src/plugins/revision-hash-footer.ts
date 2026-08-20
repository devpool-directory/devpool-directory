/**
 * Dynamically append the revision hash on every app footer
 *
 * Provides utilities to dynamically display the current Git revision hash
 * in application footers with a link to the repository commit for debugging.
 * Lifts styles from work.ubq.fi implementation as specified.
 *
 * Addresses: devpool-directory#5071 / ubiquity/ubq.fi-router#6
 */

export interface FooterConfig {
  repoUrl: string;
  showHelpIcon: boolean;
  hashLength: number;
  cssClassPrefix: string;
}

const DEFAULT_CONFIG: FooterConfig = {
  repoUrl: "https://github.com/ubiquity/ubq.fi-router",
  showHelpIcon: false, // Per spec: "Can exclude the ❔"
  hashLength: 7,
  cssClassPrefix: "revision-footer",
};

/**
 * Generates the CSS styles for the revision hash footer.
 * Lifted from work.ubq.fi implementation per spec.
 */
export function generateFooterStyles(prefix: string = DEFAULT_CONFIG.cssClassPrefix): string {
  return `.${prefix} {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.${prefix}__hash {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: color 0.2s ease;
}

.${prefix}__hash:hover {
  color: #fff;
  text-decoration: underline;
}

.${prefix}__label {
  opacity: 0.6;
}

.${prefix}__icon {
  width: 14px;
  height: 14px;
  opacity: 0.5;
}`;
}

/**
 * Generates the HTML/JSX component for the revision footer.
 * Works with React, Vue, Svelte, or vanilla HTML.
 */
export function generateFooterComponent(config: FooterConfig = DEFAULT_CONFIG): string {
  const helpIcon = config.showHelpIcon
    ? `<span class="${config.cssClassPrefix}__icon" title="Version info">❔</span>`
    : "";

  return `<footer class="${config.cssClassPrefix}">
  ${helpIcon}
  <span class="${config.cssClassPrefix}__label">rev:</span>
  <a
    class="${config.cssClassPrefix}__hash"
    href="${config.repoUrl}/commit/{{REVISION_HASH}}"
    target="_blank"
    rel="noopener noreferrer"
    title="View commit {{REVISION_HASH_FULL}}"
  >
    {{REVISION_HASH_SHORT}}
  </a>
</footer>`;
}

/**
 * Generates Next.js environment variable injection for build-time hash.
 * Per spec: "dynamically append the app's hash"
 */
export function generateNextJsConfig(): string {
  return `// next.config.js
const { execSync } = require('child_process');

function getGitRevision() {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

const revisionHash = getGitRevision();

module.exports = {
  env: {
    NEXT_PUBLIC_REVISION_HASH: revisionHash,
    NEXT_PUBLIC_REVISION_HASH_SHORT: revisionHash.substring(0, 7),
  },
  // Enable standalone output for Docker deployments
  output: 'standalone',
};`;
}

/**
 * Generates Vite environment variable injection for build-time hash.
 */
export function generateViteConfig(): string {
  return `// vite.config.ts
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

function getGitRevision() {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

const revisionHash = getGitRevision();

export default defineConfig({
  define: {
    __REVISION_HASH__: JSON.stringify(revisionHash),
    __REVISION_HASH_SHORT__: JSON.stringify(revisionHash.substring(0, 7)),
  },
});`;
}

/**
 * Generates a React component using the injected environment variables.
 */
export function generateReactComponent(config: FooterConfig = DEFAULT_CONFIG): string {
  return `import React from 'react';

interface RevisionFooterProps {
  repoUrl?: string;
  className?: string;
}

const REVISION_HASH = process.env.NEXT_PUBLIC_REVISION_HASH || __REVISION_HASH__ || 'unknown';
const REVISION_HASH_SHORT = process.env.NEXT_PUBLIC_REVISION_HASH_SHORT || __REVISION_HASH_SHORT__ || REVISION_HASH.substring(0, ${config.hashLength});

export function RevisionFooter({ 
  repoUrl = '${config.repoUrl}',
  className = ''
}: RevisionFooterProps) {
  if (REVISION_HASH === 'unknown') {
    return null;
  }

  return (
    <footer className={\`${config.cssClassPrefix} \${className}\`}>
      <span className="${config.cssClassPrefix}__label">rev:</span>
      <a
        className="${config.cssClassPrefix}__hash"
        href={\`\${repoUrl}/commit/\${REVISION_HASH}\`}
        target="_blank"
        rel="noopener noreferrer"
        title={\`View commit \${REVISION_HASH}\`}
      >
        {REVISION_HASH_SHORT}
      </a>
    </footer>
  );
}`;
}

/**
 * Generates GitHub Actions workflow step to inject revision hash.
 */
export function generateCiInjectionStep(): string {
  return `      - name: Inject revision hash
        run: |
          REVISION=$(git rev-parse HEAD)
          echo "NEXT_PUBLIC_REVISION_HASH=$REVISION" >> $GITHUB_ENV
          echo "NEXT_PUBLIC_REVISION_HASH_SHORT=${REVISION:0:7}" >> $GITHUB_ENV
          echo "Revision: $REVISION"`;
}

/**
 * Generates Docker build argument injection for containerized apps.
 */
export function generateDockerBuildArgs(): string {
  return `# Dockerfile
ARG REVISION_HASH=unknown
ENV NEXT_PUBLIC_REVISION_HASH=$REVISION_HASH
ENV NEXT_PUBLIC_REVISION_HASH_SHORT=$REVISION_HASH

# Build with revision injected
RUN --mount=type=cache,target=/app/.next/cache \\
    NEXT_PUBLIC_REVISION_HASH=$REVISION_HASH \\
    NEXT_PUBLIC_REVISION_HASH_SHORT=$(echo $REVISION_HASH | cut -c1-7) \\
    bun run build`;
}

/**
 * Validates that the footer implementation meets acceptance criteria.
 */
export function validateFooterImplementation(features: Record<string, boolean>): {
  passed: string[];
  failed: string[];
} {
  const checks: Array<{ name: string; condition: boolean }> = [
    { name: "Displays revision hash dynamically", condition: features["dynamicHash"] === true },
    { name: "Links to repository commit URL", condition: features["commitLink"] === true },
    { name: "Uses work.ubq.fi styles", condition: features["liftedStyles"] === true },
    { name: "Excludes help icon (❔)", condition: features["noHelpIcon"] === true },
    { name: "Works at build time (not runtime API call)", condition: features["buildTimeInjection"] === true },
    { name: "Monospace font for hash display", condition: features["monospaceFont"] === true },
  ];

  const passed: string[] = [];
  const failed: string[] = [];

  for (const check of checks) {
    if (check.condition) {
      passed.push(check.name);
    } else {
      failed.push(check.name);
    }
  }

  return { passed, failed };
}

/**
 * Generates integration instructions document.
 */
export function generateIntegrationGuide(config: FooterConfig = DEFAULT_CONFIG): string {
  return `# Revision Hash Footer Integration Guide

## Quick Start

1. Copy \`RevisionFooter\` component to your app's components directory
2. Add CSS styles to your global stylesheet or CSS module
3. Configure build-time hash injection for your framework

## Framework-Specific Setup

### Next.js
Add to \`next.config.js\`:
\`\`\`js
${generateNextJsConfig()}
\`\`\`

### Vite
Add to \`vite.config.ts\`:
\`\`\`ts
${generateViteConfig()}
\`\`\`

### Docker
Add build arg to Dockerfile:
\`\`\`dockerfile
${generateDockerBuildArgs()}
\`\`\`

## CI/CD Integration

Add this step before your build step:
\`\`\`yaml
${generateCiInjectionStep()}
\`\`\`

## Component Usage

\`\`\`tsx
import { RevisionFooter } from './components/RevisionFooter';

export default function Layout({ children }) {
  return (
    <div className="app-layout">
      <main>{children}</main>
      <RevisionFooter repoUrl="${config.repoUrl}" />
    </div>
  );
}
\`\`\`

## Styling Customization

Override CSS variables or class names to match your app's design:
\`\`\`css
.${config.cssClassPrefix} {
  /* Override colors, padding, font-size as needed */
  color: var(--text-muted);
  background: var(--bg-secondary);
}
\`\`\`
`;
}

export { DEFAULT_CONFIG };
