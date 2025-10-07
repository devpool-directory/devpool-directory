export function info(msg: string, obj?: unknown) {
  console.log(`[info] ${msg}`, obj ?? "");
}

export function warn(msg: string, obj?: unknown) {
  console.warn(`[warn] ${msg}`, obj ?? "");
}

export function error(msg: string, obj?: unknown) {
  console.error(`[error] ${msg}`, obj ?? "");
}

