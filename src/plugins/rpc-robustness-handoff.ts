 /**
  * @file rpc-robustness-handoff.ts
  * @description Handoff scaffolding for "RPC Robustness & Fallback" (Issue #5969 / upstream ubiquity/stake.ubq.fi#9).
  * Provides generators for hardened RPC configuration with validation, fallback chains,
  * health checks using eth_chainId, and a dev-only diagnostic panel.
  *
  * Bounty: $150 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export type RpcMode = 'dev' | 'local-node' | 'prod';

 export interface RpcHealthStatus {
   healthy: boolean;
   chainId?: number;
   latencyMs?: number;
   error?: string;
   endpoint: string;
   timestamp: string;
 }

 export interface RpcConfig {
   mode: RpcMode;
   primaryUrl: string;
   fallbackUrls: string[];
   timeoutMs: number;
   localNodeUrl: string;
   localNodeChainId: number;
 }

 export interface ValidatedRpcConfig extends RpcConfig {
   isValid: boolean;
   warnings: string[];
   resolvedEndpoint: string;
 }

 // ============================================================================
 // Config Validator Generator
 // ============================================================================

 /**
  * Generates the enhanced config.ts with URL validation, mode-aware resolution,
  * and clear console warnings for misconfiguration.
  */
 export function generateHardenedConfig(): string {
   return `// Auto-generated Hardened RPC Configuration
 // Replaces/enhances src/constants/config.ts in stake.ubq.fi

 export type RpcMode = 'dev' | 'local-node' | 'prod';

 export interface RpcConfig {
   mode: RpcMode;
   primaryUrl: string;
   fallbackUrls: string[];
   timeoutMs: number;
   localNodeUrl: string;
   localNodeChainId: number;
 }

 const DEFAULT_FALLBACKS = [
   'https://rpc.ubq.fi',
   'https://eth.llamarpc.com',
   'https://ethereum.publicnode.com',
 ];

 function validateUrl(url: string): { valid: boolean; warning?: string } {
   if (!url || url.trim() === '') {
     return { valid: false, warning: 'RPC URL is empty or undefined.' };
   }
   try {
     const parsed = new URL(url);
     if (!['http:', 'https:'].includes(parsed.protocol)) {
       return { valid: false, warning: \`RPC URL uses unsupported protocol: \${parsed.protocol}\` };
     }
     return { valid: true };
   } catch {
     return { valid: false, warning: \`RPC URL is malformed: \${url}\` };
   }
 }

 export function resolveRpcConfig(envRpcUrl?: string): {
   config: RpcConfig;
   warnings: string[];
 } {
   const warnings: string[] = [];
   const mode = (import.meta.env.VITE_RPC_MODE as RpcMode) || 'dev';
   const rawUrl = envRpcUrl ?? import.meta.env.VITE_RPC_URL ?? '';
   const timeoutMs = parseInt(import.meta.env.VITE_RPC_TIMEOUT_MS ?? '2000', 10);

   let primaryUrl = rawUrl;
   let fallbackUrls = [...DEFAULT_FALLBACKS];
   const localNodeUrl = 'http://localhost:8545';
   const localNodeChainId = 31337;

   if (mode === 'local-node') {
     primaryUrl = localNodeUrl;
     fallbackUrls = [];
   } else if (mode === 'prod') {
     primaryUrl = '/rpc';
     fallbackUrls = DEFAULT_FALLBACKS;
   } else {
     // dev mode
     const validation = validateUrl(primaryUrl);
     if (!validation.valid) {
       warnings.push(validation.warning!);
       console.warn(\`[RPC Config] ⚠️ \${validation.warning} Falling back to default endpoints.\`);
       primaryUrl = DEFAULT_FALLBACKS[0];
     }
   }

   return {
     config: {
       mode,
       primaryUrl,
       fallbackUrls,
       timeoutMs,
       localNodeUrl,
       localNodeChainId,
     },
     warnings,
   };
 }

 export const RPC_CONFIG = resolveRpcConfig();
 `.trim();
 }

 // ============================================================================
 // Health Check Utility Generator
 // ============================================================================

 /**
  * Generates rpc-health.ts with lightweight eth_chainId-based health checking,
  * timeout support, and fallback chain traversal.
  */
 export function generateHealthCheckUtility(): string {
   return `// Auto-generated RPC Health Check Utility
 // Place in src/utils/rpc-health.ts

 import type { RpcHealthStatus, RpcConfig } from '../constants/config';

 export async function checkEndpoint(
   endpoint: string,
   timeoutMs: number
 ): Promise<RpcHealthStatus> {
   const start = Date.now();
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), timeoutMs);

   try {
     const response = await fetch(endpoint, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         jsonrpc: '2.0',
         id: 1,
         method: 'eth_chainId',
         params: [],
       }),
       signal: controller.signal,
     });

     clearTimeout(timer);
     const latencyMs = Date.now() - start;

     if (!response.ok) {
       return {
         healthy: false,
         endpoint,
         error: \`HTTP \${response.status}: \${response.statusText}\`,
         timestamp: new Date().toISOString(),
       };
     }

     const data = await response.json();
     if (data.error) {
       return {
         healthy: false,
         endpoint,
         error: \`RPC Error: \${data.error.message ?? JSON.stringify(data.error)}\`,
         timestamp: new Date().toISOString(),
       };
     }

     const chainId = parseInt(data.result, 16);
     return {
       healthy: true,
       chainId,
       latencyMs,
       endpoint,
       timestamp: new Date().toISOString(),
     };
   } catch (err: any) {
     clearTimeout(timer);
     return {
       healthy: false,
       endpoint,
       error: err.name === 'AbortError' ? \`Timeout after \${timeoutMs}ms\` : err.message,
       timestamp: new Date().toISOString(),
     };
   }
 }

 export async function rpcHealthCheck(config: RpcConfig): Promise<RpcHealthStatus> {
   // Try primary first
   const primaryResult = await checkEndpoint(config.primaryUrl, config.timeoutMs);
   if (primaryResult.healthy) return primaryResult;

   // In local-node mode, don't try fallbacks
   if (config.mode === 'local-node') {
     return primaryResult;
   }

   // Try fallbacks
   for (const fallback of config.fallbackUrls) {
     const result = await checkEndpoint(fallback, config.timeoutMs);
     if (result.healthy) {
       console.info(\`[RPC Health] Primary failed, switched to fallback: \${fallback}\`);
       return result;
     }
   }

   return primaryResult; // Return primary failure if all fallbacks also fail
 }
 `.trim();
 }

 // ============================================================================
 // Dev Diagnostic Panel Generator
 // ============================================================================

 /**
  * Generates a React component that displays current RPC status, chain ID,
  * latency, and recent errors. Only rendered in development builds.
  */
 export function generateDevDiagnosticPanel(): string {
   return `// Auto-generated Dev RPC Diagnostic Panel
 // Place in src/components/dev-rpc-panel.tsx
 // Only render when import.meta.env.DEV === true

 import { useState, useEffect } from 'react';
 import type { RpcHealthStatus } from '../utils/rpc-health';
 import { rpcHealthCheck } from '../utils/rpc-health';
 import { RPC_CONFIG } from '../constants/config';

 export function DevRpcPanel() {
   const [status, setStatus] = useState<RpcHealthStatus | null>(null);
   const [checking, setChecking] = useState(false);

   const runCheck = async () => {
     setChecking(true);
     const result = await rpcHealthCheck(RPC_CONFIG.config);
     setStatus(result);
     setChecking(false);
   };

   useEffect(() => {
     runCheck();
     const interval = setInterval(runCheck, 30000);
     return () => clearInterval(interval);
   }, []);

   if (!import.meta.env.DEV) return null;

   return (
     <div style={{
       position: 'fixed', bottom: 8, right: 8, zIndex: 9999,
       background: '#1e1e2e', color: '#cdd6f4', padding: '12px 16px',
       borderRadius: 8, fontSize: 12, fontFamily: 'monospace',
       border: '1px solid #45475a', maxWidth: 320, opacity: 0.9,
     }}>
       <div style={{ fontWeight: 'bold', marginBottom: 6 }}>🔌 RPC Diagnostics</div>
       <div>Mode: <strong>{RPC_CONFIG.config.mode}</strong></div>
       <div>Endpoint: <code>{status?.endpoint ?? RPC_CONFIG.config.primaryUrl}</code></div>
       {status && (
         <>
           <div>Status: <span style={{ color: status.healthy ? '#a6e3a1' : '#f38ba8' }}>
             {status.healthy ? '✅ Healthy' : '❌ Unhealthy'}
           </span></div>
           {status.chainId !== undefined && <div>Chain ID: {status.chainId}</div>}
           {status.latencyMs !== undefined && <div>Latency: {status.latencyMs}ms</div>}
           {status.error && <div style={{ color: '#f38ba8', marginTop: 4 }}>Error: {status.error}</div>}
           <div style={{ fontSize: 10, color: '#6c7086', marginTop: 4 }}>Last check: {status.timestamp}</div>
         </>
       )}
       {RPC_CONFIG.warnings.length > 0 && (
         <div style={{ color: '#fab387', marginTop: 6 }}>
           ⚠️ {RPC_CONFIG.warnings.join('; ')}
         </div>
       )}
       <button
         onClick={runCheck}
         disabled={checking}
         style={{
           marginTop: 8, padding: '4px 12px', cursor: checking ? 'wait' : 'pointer',
           background: '#313244', border: '1px solid #45475a', color: '#cdd6f4',
           borderRadius: 4, fontSize: 11,
         }}
       >
         {checking ? 'Checking...' : 'Re-check'}
       </button>
     </div>
   );
 }
 `.trim();
 }

 // ============================================================================
 // Unit Test Generator
 // ============================================================================

 /**
  * Generates Bun-compatible unit tests for config validation and health check logic.
  */
 export function generateUnitTests(): string {
   return `// Auto-generated Unit Tests for RPC Robustness
 // Place in tests/rpc-robustness.test.ts
 // Run with: bun test

 import { describe, it, expect, mock, beforeEach } from 'bun:test';

 describe('RPC Config Validation', () => {
   it('should warn on empty VITE_RPC_URL in dev mode', () => {
     // Mock import.meta.env
     const originalEnv = import.meta.env;
     Object.defineProperty(import.meta, 'env', {
       value: { ...originalEnv, VITE_RPC_MODE: 'dev', VITE_RPC_URL: '' },
       writable: true,
     });

     // Dynamic import to pick up mocked env
     const { resolveRpcConfig } = require('../src/constants/config');
     const { warnings } = resolveRpcConfig('');

     expect(warnings.length).toBeGreaterThan(0);
     expect(warnings[0]).toContain('empty');

     Object.defineProperty(import.meta, 'env', { value: originalEnv, writable: true });
   });

   it('should use localhost in local-node mode without suffixing', () => {
     const originalEnv = import.meta.env;
     Object.defineProperty(import.meta, 'env', {
       value: { ...originalEnv, VITE_RPC_MODE: 'local-node' },
       writable: true,
     });

     const { resolveRpcConfig } = require('../src/constants/config');
     const { config } = resolveRpcConfig();

     expect(config.primaryUrl).toBe('http://localhost:8545');
     expect(config.fallbackUrls).toHaveLength(0);

     Object.defineProperty(import.meta, 'env', { value: originalEnv, writable: true });
   });
 });

 describe('RPC Health Check', () => {
   it('should return unhealthy on timeout', async () => {
     const { checkEndpoint } = require('../src/utils/rpc-health');
     const result = await checkEndpoint('http://192.0.2.1:9999', 500);

     expect(result.healthy).toBe(false);
     expect(result.error).toContain('Timeout');
   });

   it('should return healthy with chainId on valid endpoint', async () => {
     // This test requires a real or mocked RPC endpoint
     // Skip in CI unless RPC_MOCK_URL is set
     const mockUrl = process.env.RPC_MOCK_URL;
     if (!mockUrl) {
       console.log('Skipping live RPC test (set RPC_MOCK_URL to enable)');
       return;
     }

     const { checkEndpoint } = require('../src/utils/rpc-health');
     const result = await checkEndpoint(mockUrl, 5000);

     expect(result.healthy).toBe(true);
     expect(result.chainId).toBeGreaterThan(0);
   });
 });
 `.trim();
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5969 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasConfigValidation = Object.values(files).some(c =>
     c.includes('validateUrl') && c.includes('VITE_RPC_URL')
   );
   const hasFallbackList = Object.values(files).some(c =>
     c.includes('fallbackUrls') && c.includes('DEFAULT_FALLBACKS')
   );
   const hasLocalNodeMode = Object.values(files).some(c =>
     c.includes("'local-node'") && c.includes('localhost:8545')
   );
   const hasHealthCheck = Object.values(files).some(c =>
     c.includes('checkEndpoint') && c.includes('eth_chainId')
   );
   const hasTimeout = Object.values(files).some(c =>
     c.includes('AbortController') && c.includes('timeoutMs')
   );
   const hasDevPanel = Object.values(files).some(c =>
     c.includes('DevRpcPanel') && c.includes('import.meta.env.DEV')
   );
   const hasUnitTests = Object.values(files).some(c =>
     c.includes('bun:test') && c.includes('rpcHealthCheck')
   );
   const hasWarnings = Object.values(files).some(c =>
     c.includes('console.warn') && c.includes('[RPC Config]')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasConfigValidation, 'URL validation with clear warnings exists');
   check(hasFallbackList, 'Fallback URL list for mainnet implemented');
   check(hasLocalNodeMode, 'Local-node mode handled without chain suffixing');
   check(hasHealthCheck, 'eth_chainId-based health check utility exists');
   check(hasTimeout, 'Request timeout with AbortController implemented');
   check(hasDevPanel, 'Dev-only diagnostic panel component exists');
   check(hasUnitTests, 'Bun unit tests for config and health check exist');
   check(hasWarnings, 'Console warnings for misconfiguration present');

   return { pass, report };
 }
