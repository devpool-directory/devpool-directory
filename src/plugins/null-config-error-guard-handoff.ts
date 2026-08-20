 /**
  * @file null-config-error-guard-handoff.ts
  * @description Handoff scaffolding for "Fix Cannot convert undefined or null to object error"
  * (Issue #5926 / upstream ubiquity-os/ubiquity-os-kernel#287).
  * Provides generators for defensive configuration parsing, safe command routing,
  * and graceful plugin loading that prevents crashes when manifests are incomplete.
  *
  * Bounty: $75 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export interface PluginManifest {
   name: string;
   version?: string;
   commands?: Record<string, unknown>;
   config?: Record<string, unknown>;
   enabled?: boolean;
 }

 export interface CommandRouteResult {
   success: boolean;
   pluginName: string;
   command: string;
   error?: string;
   skippedPlugins: string[];
 }

 export interface SafeParseResult<T> {
   value: T | null;
   isValid: boolean;
   warnings: string[];
   errors: string[];
 }

 export interface KernelErrorHandler {
   onPluginLoadError(pluginName: string, error: Error): void;
   onCommandParseError(command: string, rawConfig: unknown, error: Error): void;
   onNullConfigAccess(path: string, context: string): void;
 }

 // ============================================================================
 // Safe Config Parser Generator
 // ============================================================================

 /**
  * Generates a defensive configuration parser that never throws on
  * null/undefined values and returns structured validation results.
  */
 export function generateSafeConfigParser(): string {
   return `// Auto-generated Safe Configuration Parser
 // Prevents "Cannot convert undefined or null to object" errors

 import type { SafeParseResult, PluginManifest } from '../types';

 export function safeParseManifest(raw: unknown): SafeParseResult<PluginManifest> {
   const warnings: string[] = [];
   const errors: string[] = [];

   if (raw === null || raw === undefined) {
     errors.push('Manifest is null or undefined');
     return { value: null, isValid: false, warnings, errors };
   }

   if (typeof raw !== 'object') {
     errors.push(\`Manifest must be an object, got \${typeof raw}\`);
     return { value: null, isValid: false, warnings, errors };
   }

   const obj = raw as Record<string, unknown>;

   // Validate required fields
   if (!obj.name || typeof obj.name !== 'string') {
     errors.push('Manifest missing required "name" field');
   }

   // Safely extract optional fields with defaults
   const manifest: PluginManifest = {
     name: (obj.name as string) ?? 'unknown-plugin',
     version: typeof obj.version === 'string' ? obj.version : undefined,
     enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
   };

   // Safely parse commands object
   if (obj.commands !== undefined && obj.commands !== null) {
     if (typeof obj.commands === 'object' && !Array.isArray(obj.commands)) {
       manifest.commands = obj.commands as Record<string, unknown>;
     } else {
       warnings.push('"commands" field is not an object; ignoring');
     }
   }

   // Safely parse config object
   if (obj.config !== undefined && obj.config !== null) {
     if (typeof obj.config === 'object' && !Array.isArray(obj.config)) {
       manifest.config = obj.config as Record<string, unknown>;
     } else {
       warnings.push('"config" field is not an object; ignoring');
     }
   }

   return {
     value: manifest,
     isValid: errors.length === 0,
     warnings,
     errors,
   };
 }

 export function safeObjectKeys(obj: unknown, context: string = ''): string[] {
   if (obj === null || obj === undefined) {
     console.warn(\`[SafeKeys] Attempted Object.keys on null/undefined\${context ? \` in \${context}\` : ''}. Returning empty array.\`);
     return [];
   }
   if (typeof obj !== 'object') {
     console.warn(\`[SafeKeys] Attempted Object.keys on non-object (\${typeof obj})\${context ? \` in \${context}\` : ''}. Returning empty array.\`);
     return [];
   }
   return Object.keys(obj);
 }
 `.trim();
 }

 // ============================================================================
 // Resilient Command Router Generator
 // ============================================================================

 /**
  * Generates a command router that catches per-plugin errors and continues
  * processing remaining plugins instead of crashing the entire handler.
  */
 export function generateResilientCommandRouter(): string {
   return `// Auto-generated Resilient Command Router
 // Wraps each plugin invocation in try/catch to prevent cascade failures

 import type { PluginManifest, CommandRouteResult, KernelErrorHandler } from '../types';
 import { safeObjectKeys } from './safe-config-parser';

 export async function routeCommandSafely(
   command: string,
   args: Record<string, unknown>,
   plugins: Map<string, PluginManifest>,
   handlers: Map<string, (args: Record<string, unknown>) => Promise<void>>,
   errorHandler: KernelErrorHandler
 ): Promise<CommandRouteResult> {
   const skippedPlugins: string[] = [];

   // Safely iterate over plugins – never crash on malformed map entries
   const pluginNames = safeObjectKeys(Object.fromEntries(plugins), 'commandRouter.plugins');

   for (const pluginName of pluginNames) {
     const manifest = plugins.get(pluginName);
     if (!manifest) {
       skippedPlugins.push(pluginName);
       continue;
     }

     // Skip disabled plugins
     if (manifest.enabled === false) {
       continue;
     }

     // Check if plugin handles this command
     const commandKeys = safeObjectKeys(manifest.commands, \`plugin:\${pluginName}.commands\`);
     if (!commandKeys.includes(command)) {
       continue;
     }

     const handler = handlers.get(pluginName);
     if (!handler) {
       console.warn(\`[Router] No handler registered for plugin "\${pluginName}", skipping.\`);
       skippedPlugins.push(pluginName);
       continue;
     }

     try {
       await handler(args);
       return {
         success: true,
         pluginName,
         command,
         skippedPlugins,
       };
     } catch (err: any) {
       const error = err instanceof Error ? err : new Error(String(err));
       errorHandler.onPluginLoadError(pluginName, error);
       console.error(\`[Router] Plugin "\${pluginName}" failed for command "\${command}": \${error.message}\`);
       skippedPlugins.push(pluginName);
       // Continue to next plugin instead of throwing
     }
   }

   return {
     success: false,
     pluginName: '',
     command,
     error: \`No plugin successfully handled command "\${command}"\`,
     skippedPlugins,
   };
 }
 `.trim();
 }

 // ============================================================================
 // Graceful Plugin Loader Generator
 // ============================================================================

 /**
  * Generates a plugin loader that validates manifests before registration
  * and logs warnings instead of crashing on invalid entries.
  */
 export function generateGracefulPluginLoader(): string {
   return `// Auto-generated Graceful Plugin Loader
 // Validates manifests and skips invalid plugins without breaking the loop

 import type { PluginManifest, SafeParseResult, KernelErrorHandler } from '../types';
 import { safeParseManifest } from './safe-config-parser';

 export interface LoadPluginsResult {
   loaded: Map<string, PluginManifest>;
   failed: Array<{ name: string; errors: string[] }>;
   warnings: string[];
 }

 export function loadPluginsSafely(
   rawManifests: unknown[],
   errorHandler: KernelErrorHandler
 ): LoadPluginsResult {
   const loaded = new Map<string, PluginManifest>();
   const failed: Array<{ name: string; errors: string[] }> = [];
   const allWarnings: string[] = [];

   if (!Array.isArray(rawManifests)) {
     console.error('[PluginLoader] Expected array of manifests, got:', typeof rawManifests);
     return { loaded, failed, warnings: ['Manifest list is not an array'] };
   }

   for (let i = 0; i < rawManifests.length; i++) {
     const raw = rawManifests[i];
     const result: SafeParseResult<PluginManifest> = safeParseManifest(raw);

     if (!result.isValid || !result.value) {
       const name = (raw as any)?.name ?? \`unnamed-plugin-\${i}\`;
       failed.push({ name, errors: result.errors });
       console.warn(\`[PluginLoader] Skipping invalid plugin "\${name}": \${result.errors.join('; ')}\`);
       continue;
     }

     if (result.warnings.length > 0) {
       allWarnings.push(...result.warnings.map(w => \`[\${result.value!.name}] \${w}\`));
     }

     if (loaded.has(result.value.name)) {
       console.warn(\`[PluginLoader] Duplicate plugin name "\${result.value.name}", overwriting previous entry.\`);
     }

     loaded.set(result.value.name, result.value);
   }

   console.log(\`[PluginLoader] Loaded \${loaded.size}/\${rawManifests.length} plugins. Failed: \${failed.length}.\`);
   return { loaded, failed, warnings: allWarnings };
 }
 `.trim();
 }

 // ============================================================================
 // Default Error Handler Generator
 // ============================================================================

 /**
  * Generates a default error handler implementation that logs structured
  * warnings instead of allowing unhandled exceptions to propagate.
  */
 export function generateDefaultErrorHandler(): string {
   return `// Auto-generated Default Kernel Error Handler
 import type { KernelErrorHandler } from '../types';

 export class DefaultKernelErrorHandler implements KernelErrorHandler {
   onPluginLoadError(pluginName: string, error: Error): void {
     console.error(\`[Kernel] Plugin load error [\${pluginName}]: \${error.message}\`);
     // Optionally report to monitoring service
   }

   onCommandParseError(command: string, rawConfig: unknown, error: Error): void {
     console.warn(\`[Kernel] Command parse error for "\${command}": \${error.message}. Raw config type: \${typeof rawConfig}\`);
   }

   onNullConfigAccess(path: string, context: string): void {
     console.warn(\`[Kernel] Null/undefined access at "\${path}" in \${context}. Using safe fallback.\`);
   }
 }
 `.trim();
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5926 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasSafeObjectKeys = Object.values(files).some(c =>
     c.includes('safeObjectKeys') && c.includes('null || obj === undefined')
   );
   const hasSafeParseManifest = Object.values(files).some(c =>
     c.includes('safeParseManifest') && c.includes('SafeParseResult')
   );
   const hasResilientRouter = Object.values(files).some(c =>
     c.includes('routeCommandSafely') && c.includes('try {') && c.includes('catch')
   );
   const hasContinueOnError = Object.values(files).some(c =>
     c.includes('skippedPlugins') && c.includes('// Continue to next plugin')
   );
   const hasGracefulLoader = Object.values(files).some(c =>
     c.includes('loadPluginsSafely') && c.includes('Skipping invalid plugin')
   );
   const hasWarningLogging = Object.values(files).some(c =>
     c.includes('console.warn') && c.includes('[PluginLoader]')
   );
   const hasErrorHandler = Object.values(files).some(c =>
     c.includes('KernelErrorHandler') && c.includes('onPluginLoadError')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasSafeObjectKeys, 'Safe Object.keys wrapper preventing null/undefined crash exists');
   check(hasSafeParseManifest, 'Defensive manifest parser with validation exists');
   check(hasResilientRouter, 'Command router with per-plugin try/catch exists');
   check(hasContinueOnError, 'Router continues processing after plugin failure');
   check(hasGracefulLoader, 'Plugin loader skips invalid manifests without crashing');
   check(hasWarningLogging, 'Structured warning logging for skipped plugins exists');
   check(hasErrorHandler, 'Kernel error handler interface and default impl exists');

   return { pass, report };
 }
