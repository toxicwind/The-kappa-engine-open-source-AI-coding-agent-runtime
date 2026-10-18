import { Config } from "@/config/config"
// kappacode_change start - preserve Kappa API default model overlay
import { recommend } from "@/kappacode/provider/catalog"
import { Auth } from "@/auth"
import { Option } from "effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { filterPromptTrainingModels, nonEmptyProviders } from "@/kappacode/provider/model-filter"
// kappacode_change end
import { Provider } from "@/provider/provider"
import * as InstanceState from "@/effect/instance-state"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api.ts"
import { markInstanceForDisposal } from "../lifecycle.ts"

export const configHandlers = HttpApiBuilder.group(InstanceHttpApi, "config", (handlers) =>
  Effect.gen(function* () {
    const providerSvc = yield* Provider.Service
    const configSvc = yield* Config.Service
    const auth = yield* Auth.Service // kappacode_change

    const get = Effect.fn("ConfigHttpApi.get")(function* () {
      return yield* configSvc.get()
    })

    const update = Effect.fn("ConfigHttpApi.update")(function* (ctx) {
      yield* configSvc.update(ctx.payload)
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return ctx.payload
    })

    // kappacode_change start
    const warnings = Effect.fn("ConfigHttpApi.warnings")(function* () {
      return yield* configSvc.warnings()
    })
    // kappacode_change end

    const providers = Effect.fn("ConfigHttpApi.providers")(function* () {
      // kappacode_change start
      const config = yield* configSvc.get()
      const providers = filterPromptTrainingModels(
        yield* providerSvc.list(),
        config.hide_prompt_training_models === true,
      )
      const defaults = Provider.defaultModelIDs(nonEmptyProviders(providers))
      // kappacode_change end

      // kappacode_change start - Fetch default model from Kappa API when the kappa provider is available.
      if (defaults[ProviderV2.ID.kappa]) {
        const info = yield* auth.get("kappa").pipe(Effect.option)
        const model = yield* Effect.promise(() =>
          recommend(
            providers[ProviderV2.ID.kappa].models,
            config.provider?.kappa?.options,
            Option.getOrUndefined(info),
            Option.isSome(info),
          ),
        )
        if (model && providers[ProviderV2.ID.kappa]?.models[model]) defaults[ProviderV2.ID.kappa] = ModelV2.ID.make(model)
      }
      // kappacode_change end

      return {
        providers: Object.values(providers).map(Provider.toPublicInfo),
        default: defaults,
      }
    })

    return handlers
      .handle("get", get)
      .handle("update", update)
      .handle("warnings", warnings)
      .handle("providers", providers) // kappacode_change
  }),
)
