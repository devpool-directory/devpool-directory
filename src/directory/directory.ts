import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import _projects from "../../projects.json";
import { installOctokitCache } from "../utils/request-cache";
dotenv.config();

// Prefer the token with the higher remaining rate limit at startup
const ACTIONS_GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const APP_INSTALLATION_TOKEN = process.env.DEVPOOL_GITHUB_API_TOKEN;

async function chooseBestToken(): Promise<string | undefined> {
  // If only one token exists, use it
  if (ACTIONS_GITHUB_TOKEN && !APP_INSTALLATION_TOKEN) return ACTIONS_GITHUB_TOKEN;
  if (!ACTIONS_GITHUB_TOKEN && APP_INSTALLATION_TOKEN) return APP_INSTALLATION_TOKEN;
  if (!ACTIONS_GITHUB_TOKEN && !APP_INSTALLATION_TOKEN) return undefined;

  // If both exist, compare remaining rate limit and pick the larger budget
  try {
    const ghOcto = createClient(ACTIONS_GITHUB_TOKEN);
    const appOcto = createClient(APP_INSTALLATION_TOKEN);

    const [ghRate, appRate] = await Promise.all([
      ghOcto.rest.rateLimit.get().then((r) => r.data.rate.remaining).catch(() => -1),
      appOcto.rest.rateLimit.get().then((r) => r.data.rate.remaining).catch(() => -1),
    ]);

    // Prefer GITHUB_TOKEN while it still has reasonable budget, else fall back to App token
    const MIN_REMAINING = 50; // threshold to avoid immediate exhaustion
    if (ghRate >= MIN_REMAINING || appRate < 0) {
      console.log(`Using GITHUB_TOKEN (remaining: ${ghRate}, app remaining: ${appRate})`);
      return ACTIONS_GITHUB_TOKEN;
    }
    console.log(`Using GitHub App token (remaining: ${appRate}, github_token remaining: ${ghRate})`);
    return APP_INSTALLATION_TOKEN;
  } catch (e) {
    // Fallback to GITHUB_TOKEN first, then app token
    return ACTIONS_GITHUB_TOKEN || APP_INSTALLATION_TOKEN;
  }
}

function createClient(token?: string) {
  const client = new Octokit({
    auth: token,
    userAgent: "devpool-directory/1.0",
  } as any);

  installOctokitCache(client as any, {
    persist: process.env.GH_CACHE_PERSIST !== "false",
    persistDir: process.env.GH_CACHE_DIR || ".cache/octokit",
    ttlMs: Number(process.env.GH_CACHE_TTL_MS || 5 * 60 * 1000),
    alwaysRevalidate: process.env.GH_CACHE_ALWAYS_REVALIDATE !== "false",
  });

  return client as unknown as Octokit;
}

// Initialize Octokit synchronously with best guess, then replace once we know better
let initialToken = ACTIONS_GITHUB_TOKEN || APP_INSTALLATION_TOKEN;
let _octokit = createClient(initialToken);
export const octokit = _octokit;

// Kick off async selection and update the client once decided
chooseBestToken()
  .then((best) => {
    if (best && best !== initialToken) {
      _octokit = createClient(best);
      // Re-export replacement by mutating the exported binding
      (module.exports as any).octokit = _octokit;
    }
  })
  .catch(() => void 0);

export const PRICING_NOT_SET = "Pricing: not set";

export const DEVPOOL_OWNER_NAME = process.env.DEVPOOL_OWNER_NAME as string;
export const DEVPOOL_REPO_NAME = process.env.DEVPOOL_REPO_NAME as string;

if (!DEVPOOL_OWNER_NAME || !DEVPOOL_REPO_NAME) {
  throw new Error("DEVPOOL_OWNER_NAME or DEVPOOL_REPO_NAME not set");
}
if (typeof DEVPOOL_OWNER_NAME !== "string" || typeof DEVPOOL_REPO_NAME !== "string") {
  throw new Error("DEVPOOL_OWNER_NAME or DEVPOOL_REPO_NAME is not a string");
}

export type GitHubIssue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];
export type GitHubLabel = RestEndpointMethodTypes["issues"]["listLabelsOnIssue"]["response"]["data"][0];
export type GitHubPullRequest = RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
export type GitHubOrganization = RestEndpointMethodTypes["orgs"]["get"]["response"]["data"];

// Extended interface for issues that includes state_reason
export interface GitHubIssueWithStateReason extends GitHubIssue {
  state_reason?: "completed" | "not_planned" | "reopened" | null;
}

export type OrgNameAndAvatarUrl = {
  ownerName: string;
  avatar_url?: string;
};

export type StateChanges<T extends string = "open" | "closed"> = {
  [key: string]: {
    cause: boolean;
    effect: T;
    comment: string;
  };
};

export const projects = _projects as {
  urls: string[];
  category?: Record<string, string>;
};

export enum Labels {
  PRICE = "Price",
  UNAVAILABLE = "Unavailable",
}
