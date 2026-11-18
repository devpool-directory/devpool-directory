import { v4 as uuidv4 } from "uuid";

export type CowOrder = {
  id: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  price: string;
  status: "open" | "filled" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type CowMap = Record<string, string>;

export function getCowClient() {
  const rpcUrl = process.env.COWPROVIDER_RPC_URL;
  const wallet = process.env.WALLET_ADDRESS;
  if (!rpcUrl || !wallet) return undefined;
  return { rpcUrl, wallet };
}

export function buildCowMap(orders: CowOrder[]): CowMap {
  const map: CowMap = {};
  for (const order of orders) {
    map[order.id] = order.id;
  }
  return map;
}

export function extractAmountFromLabel(label: string): string | null {
  const m = label.match(/^CoWSwap:\s*([0-9.]+)\s*(\w+)\s*->\s*([0-9.]+)\s*(\w+)/);
  if (!m) return null;
  const [, amountIn, tokenIn, amountOut, tokenOut] = m;
  return `${amountIn} ${tokenIn} -> ${amountOut} ${tokenOut}`;
}