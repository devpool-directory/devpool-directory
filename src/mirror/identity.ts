// Identity strategies: either an index artifact or an identity label.
export type IdentityIndex = Record<string, { directory_issue_number: number; directory_issue_url: string }>;

export function findMirrorByNodeId(index: IdentityIndex, nodeId: string) {
  return index[nodeId] ?? null;
}

