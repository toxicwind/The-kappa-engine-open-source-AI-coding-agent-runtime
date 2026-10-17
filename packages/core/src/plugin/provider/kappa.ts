import { createKappa, KILO_OPENROUTER_BASE } from "@kappacode/kappa-gateway" // kappacode_change
import { Effect } from "effect"
import { ProviderV2 } from "../../provider" // kappacode_change
import { define } from "../internal"

const id = ProviderV2.ID.kappa // kappacode_change

export const KappaPlugin = define({
  id: "kappa",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (evt) {
        for (const item of evt.provider.list()) {
          if (item.provider.id !== id) continue // kappacode_change
          evt.provider.update(item.provider.id, (provider) => {
            // kappacode_change start
            const options = provider.request.body
            const token = options.kappacodeToken ?? options.apiKey ?? process.env.KILO_API_KEY
            const org = process.env.KILO_ORG_ID ?? options.kappacodeOrganizationId

            provider.api = {
              type: "aisdk",
              package: "@kappacode/kappa-gateway",
              url: KILO_OPENROUTER_BASE,
            }
            // kappacode_change end
            provider.request.headers["HTTP-Referer"] = "https://kappa.ai/"
            // kappacode_change start
            provider.request.headers["X-Title"] = "Kappa Code"
            options.apiKey = token ?? "anonymous"
            options.kappacodeToken = options.apiKey
            if (org) options.kappacodeOrganizationId = org
            // kappacode_change end
          })
        }
      }),
    )
    // kappacode_change start
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== id) return
        evt.sdk = createKappa(evt.options)
      }),
    )
    // kappacode_change end
  }),
})
