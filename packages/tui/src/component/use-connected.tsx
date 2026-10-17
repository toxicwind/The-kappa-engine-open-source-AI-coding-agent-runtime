import { createMemo } from "solid-js"
import { useSync } from "../context/sync"

// kappacode_change start - anonymous Kappa and OpenCode providers do not prove authentication
type Provider = {
  id: string
  models: Record<string, { cost?: { input: number } }>
}

export function connected(providers: ReadonlyArray<Provider>) {
  return providers.some(
    (provider) =>
      (provider.id !== "opencode" && provider.id !== "kappa") ||
      Object.values(provider.models).some((model) => model.cost?.input !== 0),
  )
}

export function useConnected() {
  const sync = useSync()
  return createMemo(() => connected(sync.data.provider))
}
// kappacode_change end
