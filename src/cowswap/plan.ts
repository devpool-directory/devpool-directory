import { CowOrder, CowMap } from "./client";

export type Plan = {
  creates: Record<string, string>; // node_id -> order id
  deletes: string[]; // order ids
  keep: string[]; // order ids
};

export function plan({
  desiredMap,
  currentOrders,
  cowMap,
  opts,
}: {
  desiredMap: Map<string, { node_id: string; text: string; issue_url: string }>;
  currentOrders: CowOrder[];
  cowMap: CowMap;
  opts?: {
    deleteWindowDays?: number;
  };
}): Plan {
  const deleteWindowDays = opts?.deleteWindowDays ?? 0;
  const now = Date.now();
  const graceCutoff = now - deleteWindowDays * 24 * 60 * 60 * 1000;

  const desiredIds = new Set(Array.from(desiredMap.values()).map((d) => d.node_id));
  const currentIds = new Set(currentOrders.map((o) => o.id));
  const managedIds = new Set(Object.values(cowMap));

  const creates: Record<string, string> = {};
  const deletes: string[] = [];
  const keep: string[] = [];

  // Creates and keep
  for (const [node_id, d] of desiredMap.entries()) {
    const mappedId = cowMap[node_id];
    if (mappedId) {
      if (currentIds.size === 0 || currentIds.has(mappedId)) {
        keep.push(mappedId);
        continue;
      }
      creates[node_id] = mappedId;
      continue;
    }
    creates[node_id] = d.node_id;
  }

  // Managed deletes: mapped but not desired
  for (const [node_id, order_id] of Object.entries(cowMap)) {
    if (desiredMap.has(node_id)) continue;
    if (!currentIds.has(order_id)) continue;
    const order = currentOrders.find((o) => o.id === order_id);
    if (order && new Date(order.updated_at).getTime() > graceCutoff) continue;
    deletes.push(order_id);
  }

  // Unmanaged legacy deletes: order contains info not in desired URLs
  const desiredUrls = new Set(Array.from(desiredMap.values()).map((d) => d.issue_url));
  for (const order of currentOrders) {
    if (managedIds.has(order.id)) continue;
    if (desiredUrls.has(order.id)) continue;
    deletes.push(order.id);
  }

  // Ordering: creates newest first; deletes oldest first; unmanaged prior to managed
  const createEntries = Object.entries(creates).sort((a, b) => {
    const da = desiredMap.get(a[0])?.updated_at;
    const db = desiredMap.get(b[0])?.updated_at;
    const ma = da ? new Date(da).getTime() : 0;
    const mb = db ? new Date(db).getTime() : 0;
    return mb - ma;
  });
  const createsOrdered: Record<string, string> = {};
  for (const [k, v] of createEntries) createsOrdered[k] = v;

  const idToOrder = new Map(currentOrders.map((o) => [o.id, o] as const));
  const deletesOrdered = [...deletes].sort((a, b) => {
    const ta = idToOrder.get(a);
    const tb = idToOrder.get(b);
    const uma = ta && !managedIds.has(ta.id) ? 0 : 1;
    const umb = tb && !managedIds.has(tb.id) ? 0 : 1;
    if (uma !== umb) return uma - umb;
    const ma = ta?.updated_at ? new Date(ta.updated_at).getTime() : 0;
    const mb = tb?.updated_at ? new Date(tb.updated_at).getTime() : 0;
    return ma - mb;
  });

  return { creates: createsOrdered, deletes: deletesOrdered, keep };
}