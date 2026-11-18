

export type ApplyBudgets = {
  createBudget: number;
  deleteBudget: number;
};

export type ApplyDelta = {
  created: Record<string, string>; // node_id -> order_id
  deleted: string[]; // order_ids actually deleted;
};

export async function applyPlan({
  creates,
  deletes,
  budgets,
  cowMap,
}: {
  creates: Record<string, string>;
  deletes: string[];
  budgets: ApplyBudgets;
  cowMap: Record<string, string>;
}): Promise<ApplyDelta> {
  const delta: ApplyDelta = { created: {}, deleted: [] };
  const createEntries = Object.entries(creates).slice(0, budgets.createBudget);

  // Create
  for (const [node_id, orderId] of createEntries) {
    // In a real implementation, this would create a CoW order or update state
    delta.created[node_id] = orderId;
  }

  // Delete
  for (const id of deletes.slice(0, budgets.deleteBudget)) {
    // In a real implementation, this would cancel/close the CoW order
    delta.deleted.push(id);
  }

  // Merge into cowMap (in-memory)
  // Add creates
  for (const [node_id, orderId] of Object.entries(delta.created)) {
    cowMap[node_id] = orderId;
  }
  // Remove deletes that correspond to managed orders
  const invert = new Map<string, string>(); // order_id -> node_id
  for (const [node, ow] of Object.entries(cowMap)) invert.set(ow, node);
  for (const id of delta.deleted) {
    const node = invert.get(id);
    if (node) delete cowMap[node];
  }

  return delta;
}