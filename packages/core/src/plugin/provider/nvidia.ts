import { Effect } from "effect"
import { define } from "../internal"
import { ProviderV2 } from "../../provider" // kappacode_change

export const NvidiaPlugin = define({
  id: "nvidia",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (evt) {
        for (const item of evt.provider.list()) {
          if (item.provider.api.type !== "aisdk") continue
          if (item.provider.api.package !== "@ai-sdk/openai-compatible") continue
          if (item.provider.api.url !== "https://integrate.api.nvidia.com/v1") continue
          if (item.provider.id !== ProviderV2.ID.make("nvidia")) continue // kappacode_change
          evt.provider.update(item.provider.id, (provider) => {
            provider.request.headers["HTTP-Referer"] = "https://kappa.ai/" // kappacode_change
            // kappacode_change start
            provider.request.headers["X-Title"] = "Kappa Code"
            provider.request.headers["X-BILLING-INVOKE-ORIGIN"] ??= "KappaCode"
            // kappacode_change end
          })
        }
      }),
    )
  }),
})
