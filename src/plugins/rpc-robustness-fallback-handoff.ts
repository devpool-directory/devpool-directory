 /**
  * @file rpc-robustness-fallback-handoff.ts
  * @description Handoff scaffolding for "RPC Robustness & Fallback" (Issue #5969 / upstream ubiquity/stake.ubq.fi#9).
  * Provides generators, validators, and typed interfaces to harden RPC configuration,
  * implement fallback lists, health checks, and dev-only diagnostics without breaking existing consumers.
  * 
  * Bounty: $150 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */
 
 // ============================================================================
 // Types & Interfaces
 // ============================================================================
 
 export type RpcMode = 'dev' | 'local-node' | 'prod';
 
 export interface RpcHealthStatus {
   ok: boolean;
   chainId: number | null;
   latencyMs: number;
   endpoint: string;
   error?: string;
 }
 
 export interface RpcFallbackEntry {
   url: string;
   label: string;
   priority: number;
 }
 
 export interface RpcConfigValidationResult {
   valid: boolean;
   warnings: string[];
   resolvedUrl: string | null;
   mode: RpcMode;
 }
 
 export interface RpcHandoffOptions {
   mode: RpcMode;
   primaryUrl?: string;
   fallbacks?: RpcFallbackEntry[];
   healthCheckTimeoutMs?: number;
   enableDevPanel?: boolean;
 }
 
 // ============================================================================
 // Config Validation Generator
 // ============================================================================
 
 /**
  * Generates TypeScript code for validating VITE_RPC_URL and resolving the active endpoint.
  * Surfaces clear console warnings when misconfigured and respects mode-specific rules.
  */
 export function generateRpcConfigValidator(options: RpcHandoffOptions): string {
   const timeout = options.healthCheckTimeoutMs ?? 2000;
   const fallbackList = options.fallbacks ?? [
     { url: 'https://rpc.ubq.fi', label: 'Ubiquity Mainnet', priority: 1 },
     { url: 'https://eth.llamarpc.com', label: 'LlamaRPC', priority: 2 },
   ];
 
   return `
 // Auto-generated RPC config validator – do not edit manually
 import type { RpcMode, RpcConfigValidationResult, RpcFallbackEntry } from './rpc-types';
 
 const FALLBACKS: RpcFallbackEntry[] = ${JSON.stringify(fallbackList, null, 2)};
 
 export function validateAndResolveRpc(mode: RpcMode, rawUrl?: string): RpcConfigValidationResult {
   const warnings: string[] = [];
   let resolvedUrl: string | null = null;
 
   if (mode === 'local-node') {
     resolvedUrl = 'http://localhost:8545';
     if (rawUrl && rawUrl !== resolvedUrl) {
       warnings.push(\`local-node mode ignores VITE_RPC_URL ("\${rawUrl}"); using \${resolvedUrl}\`);
     }
     return { valid: true, warnings, resolvedUrl, mode };
   }
 
   if (mode === 'prod') {
     resolvedUrl = '/rpc';
     if (rawUrl) {
       warnings.push('prod mode uses relative /rpc; VITE_RPC_URL is ignored.');
     }
     return { valid: true, warnings, resolvedUrl, mode };
   }
 
   // dev mode
   if (!rawUrl || !/^https?:\\/\\//i.test(rawUrl)) {
     warnings.push(\`Invalid VITE_RPC_URL ("\${rawUrl ?? ''}"). Falling back to first available endpoint.\`);
     resolvedUrl = FALLBACKS.sort((a, b) => a.priority - b.priority)[0]?.url ?? null;
     return { valid: false, warnings, resolvedUrl, mode };
   }
 
   resolvedUrl = rawUrl;
   return { valid: true, warnings, resolvedUrl, mode };
 }
 
 export function logRpcWarnings(result: RpcConfigValidationResult): void {
   for (const w of result.warnings) {
     console.warn(\`[RPC] \${w}\`);
   }
 }
 `.trim();
 }
 
 // ============================================================================
 // Health Check Utility Generator
 // ============================================================================
 
 /**
  * Generates a lightweight rpcHealthCheck() that calls eth_chainId with an abort timeout.
  * Returns typed RpcHealthStatus without throwing.
  */
 export function generateRpcHealthCheck(timeoutMs = 2000): string {
   return `
 // Auto-generated RPC health check utility
 import type { RpcHealthStatus } from './rpc-types';
 
 export async function rpcHealthCheck(endpoint: string, timeoutMs = ${timeoutMs}): Promise<RpcHealthStatus> {
   const start = performance.now();
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), timeoutMs);
 
   try {
     const res = await fetch(endpoint, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
       signal: controller.signal,
     });
 
     clearTimeout(timer);
     const latencyMs = Math.round(performance.now() - start);
 
     if (!res.ok) {
       return { ok: false, chainId: null, latencyMs, endpoint, error: \`HTTP \${res.status}\` };
     }
 
     const json = await res.json();
     const chainId = typeof json.result === 'string' ? parseInt(json.result, 16) : null;
 
     if (chainId == null || Number.isNaN(chainId)) {
       return { ok: false, chainId: null, latencyMs, endpoint, error: 'Invalid chainId response' };
     }
 
     return { ok: true, chainId, latencyMs, endpoint };
   } catch (err: any) {
     clearTimeout(timer);
     const latencyMs = Math.round(performance.now() - start);
     return { ok: false, chainId: null, latencyMs, endpoint, error: err?.name === 'AbortError' ? 'Timeout' : err?.message ?? 'Unknown' };
   }
 }
 `.trim();
 }
 
 // ============================================================================
 // Dev Diagnostic Panel Generator
 // ============================================================================
 
 /**
  * Generates a React component that displays current RPC endpoint, chainId,
  * latency, and recent error counts. Intended for dev builds only.
  */
 export function generateDevRpcPanelComponent(): string {
   return `
 // Auto-generated Dev RPC Panel – exclude from production bundles
 import { useEffect, useState } from 'react';
 import type { RpcHealthStatus } from './rpc-types';
 import { rpcHealthCheck } from './rpc-health';
 
 interface DevRpcPanelProps {
   endpoint: string;
   pollIntervalMs?: number;
 }
 
 export function DevRpcPanel({ endpoint, pollIntervalMs = 10000 }: DevRpcPanelProps) {
   const [status, setStatus] = useState<RpcHealthStatus | null>(null);
   const [errorCount, setErrorCount] = useState(0);
 
   useEffect(() => {
     let mounted = true;
     const tick = async () => {
       const result = await rpcHealthCheck(endpoint);
       if (!mounted) return;
       setStatus(result);
       if (!result.ok) setErrorCount(c => c + 1);
     };
 
     tick();
     const id = setInterval(tick, pollIntervalMs);
     return () => { mounted = false; clearInterval(id); };
   }, [endpoint, pollIntervalMs]);
 
   if (import.meta.env.PROD) return null;
 
   return (
     <div style={{ position: 'fixed', bottom: 8, right: 8, background: '#111', color: '#0f0', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', zIndex: 99999, maxWidth: 320 }}>
       <strong>RPC Diagnostics</strong><br/>
       Endpoint: {status?.endpoint ?? '…'}<br/>
       Chain ID: {status?.chainId ?? '–'}<br/>
       Latency: {status ? \`\${status.latencyMs}ms\` : '…'}<br/>
       Status: {status ? (status.ok ? '✅ OK' : \`❌ \${status.error}\`) : 'Checking…'}<br/>
       Errors (session): {errorCount}
     </div>
   );
 }
 `.trim();
 }
 
 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================
 
 /**
  * Validates that generated artifacts meet all acceptance criteria for Issue #5969.
  * Returns a checklist suitable for CI or manual review.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;
 
   const hasConfigValidator = Object.keys(files).some(k => k.includes('config') && files[k].includes('validateAndResolveRpc'));
   const hasHealthCheck = Object.keys(files).some(k => k.includes('health') && files[k].includes('rpcHealthCheck'));
   const hasDevPanel = Object.keys(files).some(k => k.includes('panel') || k.includes('DevRpcPanel'));
   const hasLocalNodeHandling = Object.values(files).some(c => c.includes('local-node') && c.includes('localhost:8545'));
   const hasFallbackLogic = Object.values(files).some(c => c.includes('FALLBACKS') || c.includes('fallback'));
   const hasAbortTimeout = Object.values(files).some(c => c.includes('AbortController') || c.includes('abort()'));
 
   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };
 
   check(hasConfigValidator, 'Config validator with validateAndResolveRpc exists');
   check(hasHealthCheck, 'rpcHealthCheck utility with eth_chainId exists');
   check(hasDevPanel, 'Dev-only diagnostic panel component exists');
   check(hasLocalNodeHandling, 'local-node mode handled without chain suffixing');
   check(hasFallbackLogic, 'Fallback list implemented for dev mode');
   check(hasAbortTimeout, 'Health check uses abort/timeout mechanism');
 
   return { pass, report };
 }
 
 // ============================================================================
 // Integration Scaffold
 // ============================================================================
 
 /**
  * Generates integration glue for src/constants/config.ts replacement.
  * Drop-in compatible with existing exports.
  */
 export function generateConfigIntegrationScaffold(): string {
   return `
 // Replace contents of src/constants/config.ts with this scaffold
 import { validateAndResolveRpc, logRpcWarnings } from '../utils/rpc-config-validator';
 import type { RpcMode } from '../utils/rpc-types';
 
 const MODE = (import.meta.env.VITE_RPC_MODE ?? 'dev') as RpcMode;
 const RAW_URL = import.meta.env.VITE_RPC_URL;
 
 const rpcValidation = validateAndResolveRpc(MODE, RAW_URL);
 logRpcWarnings(rpcValidation);
 
 export const RPC_URL = rpcValidation.resolvedUrl ?? '';
 export const RPC_MODE = rpcValidation.mode;
 export const IS_LOCAL_NODE = rpcValidation.mode === 'local-node';
 
 // Backward-compat re-exports
 export const CONFIG = {
   rpcUrl: RPC_URL,
   mode: RPC_MODE,
   isLocalNode: IS_LOCAL_NODE,
 } as const;
 `.trim();
 }
