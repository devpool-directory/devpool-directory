/**
 * permit-generation.ts
 *
 * Interface with the permit generation service for automatic transfers.
 * When an issue is closed as "completed" with a price label, this module
 * invokes the permit generation service with `transfer: true` to automatically
 * transfer funds to the assignee.
 */

export interface PermitDescriptor {
  username: string;
  amount: string;
  address: string;
  task: {
    id: string;
    number: number;
    url: string;
  };
  transfer: boolean;
  evmPrivateKeyEncrypted: string;
}

export interface TransferResult {
  success: boolean;
  tx_hash?: string;
  error?: string;
}

/**
 * Parses a price label value to extract the numeric amount.
 * Handles formats like "Price: $500", "Price: 500", "Price: $1,000.50"
 */
export function parsePriceFromLabels(labels: (string | { name: string })[]): string | null {
  for (const label of labels || []) {
    const name = typeof label === "string" ? label : label?.name;
    const match = String(name).match(/^Price:\s*\$?([\d,]+(?:\.\d{1,2})?)/);
    if (match) {
      return match[1].replace(",", "");
    }
  }
  return null;
}

/**
 * Invokes the permit generation service with the given permits.
 * If transfer is true, the service will automatically transfer funds.
 */
export async function invokePermitGeneration(
  permitUrl: string,
  permits: PermitDescriptor[],
  dry: boolean
): Promise<TransferResult> {
  if (dry || permits.length === 0) {
    if (dry && permits.length > 0) {
      console.log(`[DRY RUN] Permit generation: ${JSON.stringify(permits, null, 2)}`);
    }
    return { success: true };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(`${permitUrl}/permit-generation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permits }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = (await response.json()) as { tx_hash?: string; error?: string };
    return {
      success: !data.error,
      tx_hash: data.tx_hash,
      error: data.error,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Request timed out after 30 seconds" };
    }
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * Builds a permit descriptor for a given assignee and issue.
 */
export function buildPermitDescriptor(params: {
  username: string;
  amount: string;
  evmPrivateKeyEncrypted: string;
  nodeId: string;
  issueNumber: number;
  issueUrl: string;
}): PermitDescriptor {
  return {
    username: params.username,
    amount: params.amount,
    address: "", // Resolved by the permit service
    task: {
      id: params.nodeId,
      number: params.issueNumber,
      url: params.issueUrl,
    },
    transfer: true,
    evmPrivateKeyEncrypted: params.evmPrivateKeyEncrypted,
  };
}
