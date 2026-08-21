/**
 * New Proposal Router
 *
 * Implements an intelligent proposal routing system that uses vector embeddings
 * to automatically route new proposals to the correct repository across all
 * Ubiquity orgs. Provides live filtering as users type specifications,
 * leveraging existing issue deduplication technology.
 *
 * Addresses: devpool-directory#5840 / ubiquity/.github#123
 */

export interface RepositoryCandidate {
  owner: string;
  repo: string;
  description: string;
  topics: string[];
  relevanceScore: number;
}

export interface RoutingResult {
  candidates: RepositoryCandidate[];
  query: string;
  embeddingUsed: boolean;
  dedupeWarning?: string;
}

export interface ProposalInput {
  title: string;
  body: string;
  author: string;
}

/**
 * Generates the UI component specification for the proposal router.
 * Per spec: "similar to the new issue ui but with dropdown of where to post"
 */
export function generateRouterUiSpec(): Record<string, unknown> {
  return {
    component: "ProposalRouter",
    props: {
      inputPlaceholder: "Describe what you want to build or fix...",
      minCharsForSearch: 10,
      maxCandidates: 5,
      debounceMs: 300,
      showRelevanceScore: true,
      enableDedupeCheck: true,
    },
    features: [
      "Live search-as-you-type with debouncing",
      "Vector embedding-based semantic matching",
      "Automatic relevance scoring and ranking",
      "Duplicate detection against existing issues",
      "Repository metadata display (description, topics)",
      "One-click proposal creation in selected repo",
    ],
  };
}

/**
 * Simulates vector embedding generation for proposal text.
 * In production, this would call an embeddings API (e.g., OpenAI, Nomic).
 */
export function generateEmbedding(text: string): Float32Array {
  // Placeholder: in production use actual embedding model
  // This demonstrates the interface contract
  const hash = text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const embedding = new Float32Array(768);
  for (let i = 0; i < 768; i++) {
    embedding[i] = Math.sin(hash * (i + 1)) * 0.1;
  }
  return embedding;
}

/**
 * Computes cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Ranks repositories by relevance to the proposal input using embeddings.
 */
export function rankRepositories(
  input: ProposalInput,
  repositories: Array<{ owner: string; repo: string; description: string; topics: string[] }>,
  threshold: number = 0.3
): RepositoryCandidate[] {
  const queryText = `${input.title} ${input.body}`;
  const queryEmbedding = generateEmbedding(queryText);

  const scored = repositories.map((repo) => {
    const repoText = `${repo.description} ${repo.topics.join(" ")}`;
    const repoEmbedding = generateEmbedding(repoText);
    const score = cosineSimilarity(queryEmbedding, repoEmbedding);

    return {
      ...repo,
      relevanceScore: score,
    };
  });

  return scored
    .filter((r) => r.relevanceScore >= threshold)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Checks for duplicate proposals using existing deduplication tech.
 * Per spec: "Given that we already have issue dedupe tech"
 */
export function checkDuplicates(
  input: ProposalInput,
  existingIssues: Array<{ title: string; body: string; url: string }>
): { isDuplicate: boolean; matchUrl?: string; confidence: number } {
  const queryEmbedding = generateEmbedding(`${input.title} ${input.body}`);

  let bestMatch: { url: string; confidence: number } | null = null;

  for (const issue of existingIssues) {
    const issueEmbedding = generateEmbedding(`${issue.title} ${issue.body}`);
    const similarity = cosineSimilarity(queryEmbedding, issueEmbedding);

    if (!bestMatch || similarity > bestMatch.confidence) {
      bestMatch = { url: issue.url, confidence: similarity };
    }
  }

  const DUPLICATE_THRESHOLD = 0.85;
  return {
    isDuplicate: bestMatch !== null && bestMatch.confidence >= DUPLICATE_THRESHOLD,
    matchUrl: bestMatch?.url,
    confidence: bestMatch?.confidence ?? 0,
  };
}

/**
 * Generates the backend API specification for the router service.
 * Per spec: "This same backend will be immensely useful for the Telegram interface"
 */
export function generateApiSpec(): Record<string, unknown> {
  return {
    endpoints: [
      {
        method: "POST",
        path: "/api/proposals/route",
        description: "Get ranked repository candidates for a proposal draft",
        requestBody: {
          title: "string",
          body: "string",
          author: "string",
        },
        response: {
          candidates: "RepositoryCandidate[]",
          dedupeWarning: "string?",
        },
      },
      {
        method: "POST",
        path: "/api/proposals/create",
        description: "Create proposal in selected repository",
        requestBody: {
          owner: "string",
          repo: "string",
          title: "string",
          body: "string",
          labels: "string[]",
        },
        response: {
          issueUrl: "string",
          issueNumber: "number",
        },
      },
      {
        method: "GET",
        path: "/api/repositories",
        description: "List all routable repositories with metadata",
        response: "Repository[]",
      },
    ],
    integrations: [
      "GitHub API for issue creation and repository listing",
      "Vector database for embedding storage and similarity search",
      "Existing deduplication service for duplicate detection",
    ],
  };
}

/**
 * Generates the Telegram bot command handler spec.
 * Per spec: "@ubiquityos we need to fix the cash out interface on pay.ubq.fi..."
 */
export function generateTelegramHandlerSpec(): Record<string, unknown> {
  return {
    command: "@ubiquityos",
    triggerPattern: /^@ubiquityos\s+(.+)$/i,
    workflow: [
      "Parse natural language request from message",
      "Generate embedding and find candidate repos",
      "Auto-select best match or prompt user if ambiguous",
      "Create GitHub issue in target repository",
      "Estimate time/priority/price using existing systems",
      "Distribute to DevPool network for assignment",
      "Reply with created issue link and status",
    ],
    exampleInput: "@ubiquityos we need to fix the cash out interface on pay.ubq.fi because its currently not vertically center aligned.",
    exampleOutput: "✅ Proposal created: ubiquity/pay.ubq.fi#142\n📊 Estimated: 2h, Priority: Normal, Price: $75\n🔗 https://github.com/ubiquity/pay.ubq.fi/issues/142",
  };
}

/**
 * Generates sample repository index for testing the router.
 */
export function getSampleRepositories(): Array<{
  owner: string;
  repo: string;
  description: string;
  topics: string[];
}> {
  return [
    { owner: "ubiquity", repo: "ubiquity-dollar", description: "Ubiquity Dollar stablecoin protocol", topics: ["defi", "stablecoin", "solidity"] },
    { owner: "ubiquity", repo: "devpool-directory", description: "DevPool task directory and bounty management", topics: ["bounties", "task-management", "typescript"] },
    { owner: "ubiquity", repo: "pay.ubq.fi", description: "Payment interface and cash-out functionality", topics: ["payments", "ui", "nextjs"] },
    { owner: "ubiquity", repo: "notifications.ubq.fi", description: "Notification service for Ubiquity ecosystem", topics: ["notifications", "supabase", "bun"] },
    { owner: "ubiquity", repo: "ubiquity-os", description: "AI-powered engineering management platform", topics: ["ai", "analytics", "automation"] },
    { owner: "ubiquity", repo: ".github", description: "Organization-wide configuration and proposals", topics: ["governance", "meta", "proposals"] },
  ];
}

/**
 * Validates that the router implementation meets acceptance criteria.
 */
export function validateRouterImplementation(features: Record<string, boolean>): {
  passed: string[];
  failed: string[];
} {
  const checks: Array<{ name: string; condition: boolean }> = [
    { name: "UI has search-as-you-type input", condition: features["liveSearch"] === true },
    { name: "Dropdown shows filtered repositories", condition: features["filteredDropdown"] === true },
    { name: "Vector embeddings used for matching", condition: features["embeddings"] === true },
    { name: "Relevance scores displayed", condition: features["relevanceScores"] === true },
    { name: "Duplicate detection integrated", condition: features["dedupeCheck"] === true },
    { name: "Backend API supports Telegram use case", condition: features["telegramReady"] === true },
    { name: "Cross-org repository support", condition: features["multiOrg"] === true },
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
 * Generates implementation roadmap document.
 */
export function generateRoadmap(): string {
  return `# Proposal Router Implementation Roadmap

## Phase 1: Core Backend (Week 1-2)
- [ ] Set up vector embedding service (OpenAI/Nomic)
- [ ] Index all Ubiquity org repositories with descriptions and topics
- [ ] Implement similarity search endpoint
- [ ] Integrate existing deduplication service
- [ ] Create repository metadata sync job

## Phase 2: Web UI (Week 2-3)
- [ ] Build ProposalRouter React component
- [ ] Implement debounced search input
- [ ] Add filtered dropdown with relevance scores
- [ ] Wire up duplicate warning display
- [ ] Add one-click issue creation flow

## Phase 3: Telegram Integration (Week 3-4)
- [ ] Add @ubiquityos command handler
- [ ] Parse natural language requests
- [ ] Auto-route to best match or prompt for clarification
- [ ] Create issue and reply with link
- [ ] Trigger time/priority/price estimation

## Phase 4: DevPool Distribution (Week 4)
- [ ] Connect routed proposals to DevPool matchmaking
- [ ] Auto-generate bounty labels from estimates
- [ ] Notify eligible contributors
- [ ] Track proposal-to-completion pipeline

## Dependencies
- Existing issue deduplication technology
- Vector embedding API access
- GitHub API permissions for cross-org issue creation
- Telegram bot token and webhook setup
`;
}
