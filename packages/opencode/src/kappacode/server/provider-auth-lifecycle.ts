import { InstanceStore } from "@/project/instance-store"
import { ModelCache } from "@/provider/model-cache"
import { KappaViewers } from "@/kappacode/presence/service" // kappacode_change
import { Effect } from "effect"

export const disposeAllInstancesAfterProviderAuthCallback = Effect.fn(
  "KappaServer.disposeAllInstancesAfterProviderAuthCallback",
)(function* () {
  const store = yield* InstanceStore.Service
  yield* store.disposeAll()
})

// kappacode_change start - drop the old presence socket; callers invoke this for the "kappa" provider only
export const invalidatePresence = Effect.fn("KappaServer.invalidatePresence")(function* () {
  const viewers = yield* KappaViewers.Service
  yield* viewers.invalidateAuth()
})
// kappacode_change end

export const invalidateAfterProviderAuthChange = Effect.fn("KappaServer.invalidateAfterProviderAuthChange")(function* (
  providerID: string,
) {
  const cache = yield* ModelCache.Service
  yield* cache.clear(providerID)
  yield* disposeAllInstancesAfterProviderAuthCallback()
})
