import type { Storage } from "./storage.ts"

export function checkBufferCap(
  storage: Storage,
  opts: { capacityBytes: number },
): { tripped: boolean; dbSize: number } {
  const dbSize = storage.dbSize()
  return { tripped: dbSize > opts.capacityBytes, dbSize }
}
