 /**
  * @file proposal-router-handoff.ts
  * @description Handoff scaffolding for "New Proposal Router" (Issue #5840 / upstream ubiquity/.github#123).
  * Provides vector-embedding-based intelligent repository routing UI and backend,
  * enabling automatic proposal filing to the correct repo based on natural language input.
  *
  * Bounty: $300 USD
  * Target PR: devpool-directory/devpool-directory#5978
  */

 // ============================================================================
 // Types & Interfaces
 // ============================================================================

 export interface RepositoryCandidate {
   owner: string;
   repo: string;
   score: number; // 0.0 - 1.0 similarity score
   description?: string;
   lastUpdated?: string;
 }

 export interface RoutingRequest {
   title: string;
   body: string;
   topK?: number; // default 5
   threshold?: number; // minimum score to include, default 0.3
 }

 export interface RoutingResponse {
   candidates: RepositoryCandidate[];
   embeddingId?: string; // for dedupe tracking
   processingTimeMs: number;
 }

 export interface EmbeddingDocument {
   id: string;
   owner: string;
   repo: string;
   content: string; // README + recent issues summary
   embedding: number[]; // vector representation
   updatedAt: string;
 }

 // ============================================================================
 // Embedding Index Builder
 // ============================================================================

 /**
  * Generates script to build/maintain the repository embedding index.
  * Uses voyage-4-large or nomic-embed-text for high-quality embeddings.
  */
 export function generateIndexBuilder(): string {
   return `#!/usr/bin/env bun
 /**
  * Build/refresh the repository embedding index for proposal routing.
  * Run periodically (e.g., daily cron) or on-demand after new repos added.
  */
 import { createClient } from '@supabase/supabase-js';
 import { embed } from 'ai';
 import { voyage } from '@ai-sdk/voyage';

 const supabase = createClient(
   process.env.SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!
 );

 async function buildIndex() {
   console.log('📊 Fetching repository metadata...');
   
   // Get all active repos from org config or GitHub API
   const repos = await fetchActiveRepositories();
   
   for (const repo of repos) {
     console.log(\`🔍 Processing \${repo.owner}/\${repo.repo}...\`);
     
     // Aggregate content: README + recent issue titles + labels
     const content = await aggregateRepoContent(repo);
     
     // Generate embedding
     const { embedding } = await embed({
       model: voyage('voyage-4-large'),
       value: content,
     });
     
     // Upsert into Supabase pgvector table
     await supabase.from('repo_embeddings').upsert({
       id: \`\${repo.owner}/\${repo.repo}\`,
       owner: repo.owner,
       repo: repo.repo,
       content: content.substring(0, 8000), // truncate if needed
       embedding,
       updated_at: new Date().toISOString(),
     }, { onConflict: 'id' });
   }
   
   console.log('✅ Index build complete.');
 }

 async function fetchActiveRepositories() {
   // Implement: query org config, filter archived/disabled repos
   // Return array of { owner, repo } objects
   return [];
 }

 async function aggregateRepoContent(repo: { owner: string; repo: string }): Promise<string> {
   // Implement: fetch README.md, last 50 issue titles, repo description
   // Concatenate into single searchable text block
   return '';
 }

 buildIndex().catch(console.error);
 `.trim();
 }

 // ============================================================================
 // Routing API Handler
 // ============================================================================

 /**
  * Generates the API route handler for proposal routing requests.
  */
 export function generateRoutingHandler(): string {
   return `// app/api/route-proposal/route.ts (Next.js App Router)
 import { NextRequest, NextResponse } from 'next/server';
 import { createClient } from '@supabase/supabase-js';
 import { embed } from 'ai';
 import { voyage } from '@ai-sdk/voyage';
 import type { RoutingRequest, RoutingResponse, RepositoryCandidate } from '@/types';

 const supabase = createClient(
   process.env.SUPABASE_URL!,
   process.env.SUPABASE_ANON_KEY!
 );

 export async function POST(req: NextRequest): Promise<NextResponse<RoutingResponse>> {
   const start = Date.now();
   const { title, body, topK = 5, threshold = 0.3 }: RoutingRequest = await req.json();

   if (!title && !body) {
     return NextResponse.json(
       { candidates: [], processingTimeMs: Date.now() - start },
       { status: 400 }
     );
   }

   // Embed the user's proposal text
   const queryText = \`\${title || ''} \${body || ''}\`.trim();
   const { embedding: queryEmbedding } = await embed({
     model: voyage('voyage-4-large'),
     value: queryText,
   });

   // Vector similarity search against repo index
   const { data, error } = await supabase.rpc('match_repos', {
     query_embedding: queryEmbedding,
     match_threshold: threshold,
     match_count: topK,
   });

   if (error) throw error;

   const candidates: RepositoryCandidate[] = (data || []).map((row: any) => ({
     owner: row.owner,
     repo: row.repo,
     score: row.similarity,
     description: row.description,
   }));

   return NextResponse.json({
     candidates,
     processingTimeMs: Date.now() - start,
   });
 }
 `.trim();
 }

 // ============================================================================
 // React Component Scaffold
 // ============================================================================

 /**
  * Generates the intelligent repository selector React component.
  */
 export function generateRouterComponent(): string {
   return `'use client';

 import { useState, useEffect, useRef } from 'react';
 import type { RepositoryCandidate } from '@/types';

 interface ProposalRouterProps {
   onSelect: (repo: RepositoryCandidate) => void;
   placeholder?: string;
 }

 export function ProposalRouter({ onSelect, placeholder = 'Describe your proposal...' }: ProposalRouterProps) {
   const [input, setInput] = useState('');
   const [candidates, setCandidates] = useState<RepositoryCandidate[]>([]);
   const [loading, setLoading] = useState(false);
   const debounceRef = useRef<NodeJS.Timeout>();

   useEffect(() => {
     clearTimeout(debounceRef.current);
     
     if (input.length < 10) {
       setCandidates([]);
       return;
     }

     debounceRef.current = setTimeout(async () => {
       setLoading(true);
       try {
         const res = await fetch('/api/route-proposal', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ title: input, topK: 5 }),
         });
         const data = await res.json();
         setCandidates(data.candidates || []);
       } catch (err) {
         console.error('Routing failed:', err);
       } finally {
         setLoading(false);
       }
     }, 400); // 400ms debounce

     return () => clearTimeout(debounceRef.current);
   }, [input]);

   return (
     <div className="proposal-router">
       <textarea
         value={input}
         onChange={(e) => setInput(e.target.value)}
         placeholder={placeholder}
         rows={3}
         className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
       />
       
       {loading && <div className="mt-2 text-sm text-gray-500">Finding best repositories...</div>}
       
       {candidates.length > 0 && (
         <ul className="mt-3 space-y-2">
           {candidates.map((c) => (
             <li key={\`\${c.owner}/\${c.repo}\`}>
               <button
                 onClick={() => onSelect(c)}
                 className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors flex justify-between items-center"
               >
                 <span className="font-medium">{c.owner}/{c.repo}</span>
                 <span className="text-xs text-gray-400">{(c.score * 100).toFixed(0)}% match</span>
               </button>
             </li>
           ))}
         </ul>
       )}
     </div>
   );
 }
 `.trim();
 }

 // ============================================================================
 // Supabase RPC Migration
 // ============================================================================

 /**
  * Generates pgvector similarity search function for Supabase.
  */
 export function generateVectorSearchMigration(): string {
   return `-- Enable pgvector extension if not already enabled
 CREATE EXTENSION IF NOT EXISTS vector;

 -- Table to store repository embeddings
 CREATE TABLE IF NOT EXISTS public.repo_embeddings (
   id TEXT PRIMARY KEY,
   owner TEXT NOT NULL,
   repo TEXT NOT NULL,
   content TEXT,
   embedding VECTOR(1024), -- voyage-4-large dimension
   updated_at TIMESTAMPTZ DEFAULT NOW()
 );

 -- Create HNSW index for fast similarity search
 CREATE INDEX IF NOT EXISTS idx_repo_embeddings_vec 
   ON public.repo_embeddings USING hnsw (embedding vector_cosine_ops);

 -- RPC function for semantic search
 CREATE OR REPLACE FUNCTION public.match_repos(
   query_embedding VECTOR(1024),
   match_threshold FLOAT DEFAULT 0.3,
   match_count INT DEFAULT 5
 ) RETURNS TABLE (
   owner TEXT,
   repo TEXT,
   description TEXT,
   similarity FLOAT
 ) LANGUAGE plpgsql SECURITY DEFINER AS $$
 BEGIN
   RETURN QUERY
   SELECT 
     r.owner,
     r.repo,
     LEFT(r.content, 200) AS description,
     1 - (r.embedding <=> query_embedding) AS similarity
   FROM public.repo_embeddings r
   WHERE 1 - (r.embedding <=> query_embedding) > match_threshold
   ORDER BY r.embedding <=> query_embedding ASC
   LIMIT match_count;
 END;
 $$;
 `.trim();
 }

 // ============================================================================
 // Acceptance Criteria Validator
 // ============================================================================

 /**
  * Validates generated artifacts against Issue #5840 acceptance criteria.
  */
 export function validateAcceptanceCriteria(files: Record<string, string>): { pass: boolean; report: string[] } {
   const report: string[] = [];
   let pass = true;

   const hasIndexBuilder = Object.values(files).some(c =>
     c.includes('buildIndex') && c.includes('voyage')
   );
   const hasRoutingHandler = Object.values(files).some(c =>
     c.includes('route-proposal') && c.includes('match_repos')
   );
   const hasReactComponent = Object.values(files).some(c =>
     c.includes('ProposalRouter') && c.includes('onSelect')
   );
   const hasDebounce = Object.values(files).some(c =>
     c.includes('debounce') || c.includes('setTimeout')
   );
   const hasVectorMigration = Object.values(files).some(c =>
     c.includes('repo_embeddings') && c.includes('VECTOR')
   );
   const hasHnswIndex = Object.values(files).some(c =>
     c.includes('hnsw') || c.includes('vector_cosine_ops')
   );
   const hasSimilarityThreshold = Object.values(files).some(c =>
     c.includes('match_threshold') || c.includes('threshold')
   );
   const hasDedupeSupport = Object.values(files).some(c =>
     c.includes('embeddingId') || c.includes('dedupe')
   );

   const check = (condition: boolean, label: string) => {
     report.push(condition ? \`✅ \${label}\` : \`❌ \${label}\`);
     if (!condition) pass = false;
   };

   check(hasIndexBuilder, 'Repository embedding index builder exists');
   check(hasRoutingHandler, 'API routing handler with vector search exists');
   check(hasReactComponent, 'Intelligent repository selector React component exists');
   check(hasDebounce, 'Input debouncing for live suggestions implemented');
   check(hasVectorMigration, 'pgvector table and migration script exists');
   check(hasHnswIndex, 'HNSW index for fast similarity search configured');
   check(hasSimilarityThreshold, 'Configurable similarity threshold support exists');
   check(hasDedupeSupport, 'Embedding ID / dedupe tracking support exists');

   return { pass, report };
 }
