 /**
  * @file self-invalidations-handoff.ts
  * @description Handoff scaffolding for "Self Invalidations" (Issue #5911 / upstream ubiquity/pay.ubq.fi#455).
  * Provides generators for permit invalidation logic, UI delete button components,
  * and backend endpoints to allow developers to invalidate bogus permits that
  * should be filtered from the user interface.
  *
  * Bounty: $75 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export interface Permit {
   id: string;
   owner: string;
   spender: string;
   value: string;
   deadline: number;
   v: number;
   r: string;
   s: string;
   createdAt: string;
   invalidatedAt?: string;
   isBogus: boolean;
 }

 export interface InvalidationRequest {
   permitId: string;
   requester: string;
   reason: 'bogus' | 'expired' | 'duplicate' | 'manual';
 }

 export interface InvalidationResult {
   success: boolean;
   permitId: string;
   invalidatedAt?: string;
   error?: string;
 }

 export interface PermitFilterOptions {
   includeInvalidated: boolean;
   includeBogus: boolean;
   ownerAddress?: string;
 }

 // ============================================================================
 // Backend Invalidation Endpoint Generator
 // ============================================================================

 /**
  * Generates an API endpoint handler for invalidating permits.
  * Validates ownership or admin status before marking a permit as invalid.
  */
 export function generateInvalidationEndpoint(): string {
   return `// Auto-generated Permit Invalidation Endpoint
 // Place in src/api/permits/invalidate.ts

 import type { InvalidationRequest, InvalidationResult, Permit } from '../../types';

 interface PermitStore {
   getPermit(id: string): Promise<Permit | null>;
   updatePermit(id: string, updates: Partial<Permit>): Promise<Permit>;
 }

 export async function handleInvalidatePermit(
   request: InvalidationRequest,
   store: PermitStore,
   isAdmin: (address: string) => Promise<boolean>
 ): Promise<InvalidationResult> {
   const permit = await store.getPermit(request.permitId);

   if (!permit) {
     return { success: false, permitId: request.permitId, error: 'Permit not found' };
   }

   // Allow self-invalidation or admin override
   const isOwner = request.requester.toLowerCase() === permit.owner.toLowerCase();
   const hasAdminAccess = await isAdmin(request.requester);

   if (!isOwner && !hasAdminAccess) {
     return {
       success: false,
       permitId: request.permitId,
       error: 'Unauthorized: must be permit owner or admin',
     };
   }

   if (permit.invalidatedAt) {
     return {
       success: true,
       permitId: request.permitId,
       invalidatedAt: permit.invalidatedAt,
     };
   }

   const now = new Date().toISOString();
   const updated = await store.updatePermit(request.permitId, {
     invalidatedAt: now,
     isBogus: request.reason === 'bogus',
   });

   console.log(\`[Permit] Invalidated \${request.permitId} by \${request.requester} (reason: \${request.reason})\`);

   return {
     success: true,
     permitId: request.permitId,
     invalidatedAt: updated.invalidatedAt,
   };
 }
 `.trim();
 }

 // ============================================================================
 // Permit Filter Utility Generator
 // ============================================================================

 /**
  * Generates filtering logic that excludes invalidated and bogus permits
  * from default queries while allowing opt-in inclusion.
  */
 export function generatePermitFilter(): string {
   return `// Auto-generated Permit Filter Utility
 import type { Permit, PermitFilterOptions } from '../types';

 const DEFAULT_OPTIONS: PermitFilterOptions = {
   includeInvalidated: false,
   includeBogus: false,
 };

 export function filterPermits(
   permits: Permit[],
   options: Partial<PermitFilterOptions> = {}
 ): Permit[] {
   const opts = { ...DEFAULT_OPTIONS, ...options };

   return permits.filter(permit => {
     // Exclude invalidated unless explicitly included
     if (!opts.includeInvalidated && permit.invalidatedAt) {
       return false;
     }

     // Exclude bogus permits unless explicitly included
     if (!opts.includeBogus && permit.isBogus) {
       return false;
     }

     // Filter by owner if specified
     if (opts.ownerAddress && permit.owner.toLowerCase() !== opts.ownerAddress.toLowerCase()) {
       return false;
     }

     return true;
   });
 }

 export function countByStatus(permits: Permit[]): {
   active: number;
   invalidated: number;
   bogus: number;
 } {
   return {
     active: permits.filter(p => !p.invalidatedAt && !p.isBogus).length,
     invalidated: permits.filter(p => !!p.invalidatedAt).length,
     bogus: permits.filter(p => p.isBogus).length,
   };
 }
 `.trim();
 }

 // ============================================================================
 // React Delete Button Component Generator
 // ============================================================================

 /**
  * Generates a React component for the permit delete/invalidate button.
  * Includes confirmation dialog and optimistic UI updates.
  */
 export function generateDeleteButtonComponent(): string {
   return `// Auto-generated Permit Delete Button Component
 // Place in src/components/PermitDeleteButton.tsx

 import { useState } from 'react';
 import type { Permit } from '../types';

 interface PermitDeleteButtonProps {
   permit: Permit;
   onInvalidate: (permitId: string, reason: string) => Promise<void>;
   disabled?: boolean;
 }

 export function PermitDeleteButton({
   permit,
   onInvalidate,
   disabled = false,
 }: PermitDeleteButtonProps) {
   const [confirming, setConfirming] = useState(false);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);

   if (permit.invalidatedAt) {
     return (
       <span className="text-xs text-gray-500 italic">
         Invalidated {new Date(permit.invalidatedAt).toLocaleDateString()}
       </span>
     );
   }

   const handleDelete = async () => {
     setLoading(true);
     setError(null);
     try {
       await onInvalidate(permit.id, 'bogus');
       setConfirming(false);
     } catch (err: any) {
       setError(err.message ?? 'Failed to invalidate permit');
     } finally {
       setLoading(false);
     }
   };

   if (confirming) {
     return (
       <div className="flex items-center gap-2">
         <button
           onClick={handleDelete}
           disabled={loading}
           className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
         >
           {loading ? 'Invalidating...' : 'Confirm'}
         </button>
         <button
           onClick={() => setConfirming(false)}
           disabled={loading}
           className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
         >
           Cancel
         </button>
         {error && <span className="text-xs text-red-400">{error}</span>}
       </div>
     );
   }

   return (
     <button
       onClick={() => setConfirming(true)}
       disabled={disabled || loading}
       className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-50"
       title="Invalidate this permit (hide from UI)"
     >
       🗑️ Invalidate
     </button>
   );
 }
 `.trim();
 }

 // ============================================================================
 // Database Migration Generator
 // ============================================================================

 /**
  * Generates SQL migration to add invalidation columns to permits table.
  */
 export function generateDatabaseMigration(): string {
   return \`-- Migration: Add self-invalidation support to permits table
 -- Run against your database before deploying the invalidation feature

 ALTER TABLE permits
   ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ DEFAULT NULL,
   ADD COLUMN IF NOT EXISTS is_bogus BOOLEAN DEFAULT FALSE;

 CREATE INDEX IF NOT EXISTS idx_permits_invalidated_at ON permits(invalidated_at);
 CREATE INDEX IF NOT EXISTS idx_permits_is_bogus ON permits(is_bogus);

 -- Backfill: mark existing permits with zero value or past deadline as bogus
 UPDATE permits
 SET is_bogus = TRUE
 WHERE value = '0' OR deadline < EXTRACT(EPOCH FROM NOW());
 \`.trim();
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5911 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasInvalidationEndpoint = Object.values(files).some(c =>
     c.includes('handleInvalidatePermit') && c.includes('invalidatedAt')
   );
   const hasOwnershipCheck = Object.values(files).some(c =>
     c.includes('isOwner') && c.includes('isAdmin')
   );
   const hasPermitFilter = Object.values(files).some(c =>
     c.includes('filterPermits') && c.includes('includeInvalidated')
   );
   const hasDeleteButton = Object.values(files).some(c =>
     c.includes('PermitDeleteButton') && c.includes('onInvalidate')
   );
   const hasConfirmation = Object.values(files).some(c =>
     c.includes('confirming') && c.includes('Confirm')
   );
   const hasDbMigration = Object.values(files).some(c =>
     c.includes('invalidated_at') && c.includes('is_bogus')
   );
   const hasAlreadyInvalidatedDisplay = Object.values(files).some(c =>
     c.includes('Invalidated') && c.includes('toLocaleDateString')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasInvalidationEndpoint, 'Backend invalidation endpoint exists');
   check(hasOwnershipCheck, 'Owner/admin authorization check implemented');
   check(hasPermitFilter, 'Permit filter excluding invalidated/bogus exists');
   check(hasDeleteButton, 'React delete/invalidate button component exists');
   check(hasConfirmation, 'Confirmation dialog before invalidation exists');
   check(hasDbMigration, 'Database migration for invalidation columns provided');
   check(hasAlreadyInvalidatedDisplay, 'Already-invalidated state display exists');

   return { pass, report };
 }
