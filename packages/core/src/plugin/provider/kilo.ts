import { createKilo, KILO_OPENROUTER_BASE } from "@kappacode/kappa-gateway" // kilocode_change
import { Effect } from "effect"
import { ProviderV2 } from "../../provider" // kilocode_change
import { define } from "../internal"

const id = ProviderV2.ID.kappa // kilocode_change

export const KiloPlugin = define({
  id: "kappa",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (evt) {
        for (const item of evt.provider.list()) {
          if (item.provider.id !== id) continue // kilocode_change
          evt.provider.update(item.provider.id, (provider) => {
            // kilocode_change start
            const options = provider.request.body
            const token = options.kilocodeToken ?? options.apiKey ?? process.env.KILO_API_KEY
            const org = process.env.KILO_ORG_ID ?? options.kilocodeOrganizationId

            provider.api = {
              type: "aisdk",
              package: "@kappacode/kappa-gateway",
              url: KILO_OPENROUTER_BASE,
            }
            // kilocode_change end
            provider.request.headers["HTTP-Referer"] = "https://kappa.ai/"
            // kilocode_change start
            provider.request.headers["X-Title"] = "Kilo Code"
            options.apiKey = token ?? "anonymous"
            options.kilocodeToken = options.apiKey
            if (org) options.kilocodeOrganizationId = org
            // kilocode_change end
          })
        }
      }),
    )
    // kilocode_change start
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== id) return
        evt.sdk = createKilo(evt.options)
      }),
    )
    // kilocode_change end
  }),
})
