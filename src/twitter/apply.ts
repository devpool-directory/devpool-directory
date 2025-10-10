import { createTweet, deleteTweetById } from "./client";

export type ApplyBudgets = {
  createBudget: number;
  deleteBudget: number;
};

export type ApplyDelta = {
  created: Record<string, string>; // node_id -> tweet_id
  deleted: string[]; // tweet_ids actually deleted
};

export async function applyPlan({
  creates,
  deletes,
  budgets,
  twitterMap,
}: {
  creates: Record<string, string>;
  deletes: string[];
  budgets: ApplyBudgets;
  twitterMap: Record<string, string>;
}): Promise<ApplyDelta> {
  const delta: ApplyDelta = { created: {}, deleted: [] };
  const createEntries = Object.entries(creates).slice(0, budgets.createBudget);

  // Create
  for (const [node_id, text] of createEntries) {
    const res = await createTweet(text);
    const tweet_id = res?.id ? String(res.id) : null;
    if (tweet_id) {
      delta.created[node_id] = tweet_id;
    }
  }

  // Delete
  for (const id of deletes.slice(0, budgets.deleteBudget)) {
    const ok = await deleteTweetById(id);
    if (ok) delta.deleted.push(id);
  }

  // Merge into twitterMap (in-memory)
  // Add creates
  for (const [node_id, tweet_id] of Object.entries(delta.created)) {
    twitterMap[node_id] = tweet_id;
  }
  // Remove deletes that correspond to managed tweets
  const invert = new Map<string, string>(); // tweet_id -> node_id
  for (const [node, tw] of Object.entries(twitterMap)) invert.set(tw, node);
  for (const tid of delta.deleted) {
    const node = invert.get(tid);
    if (node) delete twitterMap[node];
  }

  return delta;
}

