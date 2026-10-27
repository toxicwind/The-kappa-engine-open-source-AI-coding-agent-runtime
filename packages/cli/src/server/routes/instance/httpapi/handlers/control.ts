import { Auth } from "@/auth"
// kappacode_change start
import {
  invalidateAfterProviderAuthChange,
  invalidatePresence,
} from "@/kappacode/server/provider-auth-lifecycle"
// kappacode_change end
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { RootHttpApi } from "../api.ts"
import { LogInput } from "../groups/control.ts"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { remove as removeAuth } from "@/kappacode/auth/remove" // kappacode_change

export const controlHandlers = HttpApiBuilder.group(RootHttpApi, "control", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service

    const authSet = Effect.fn("ControlHttpApi.authSet")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      payload: Auth.Info
    }) {
      yield* auth.set(ctx.params.providerID, ctx.payload).pipe(Effect.orDie)
      // kappacode_change start - drop old presence socket before instance disposal on Kappa auth changes
      if (ctx.params.providerID === "kappa") yield* invalidatePresence()
      yield* invalidateAfterProviderAuthChange(ctx.params.providerID)
      // kappacode_change end
      return true
    })

    const authRemove = Effect.fn("ControlHttpApi.authRemove")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
    }) {
      // kappacode_change start
      yield* removeAuth(ctx.params.providerID)
      if (ctx.params.providerID === "kappa") yield* invalidatePresence()
      yield* invalidateAfterProviderAuthChange(ctx.params.providerID)
      // kappacode_change end
      return true
    })

    const log = Effect.fn("ControlHttpApi.log")(function* (ctx: { payload: typeof LogInput.Type }) {
      const write =
        ctx.payload.level === "debug"
          ? Effect.logDebug
          : ctx.payload.level === "info"
            ? Effect.logInfo
            : ctx.payload.level === "warn"
              ? Effect.logWarning
              : Effect.logError
      yield* write(ctx.payload.message).pipe(Effect.annotateLogs(ctx.payload.extra ?? {}))
      return true
    })

    return handlers.handle("authSet", authSet).handle("authRemove", authRemove).handle("log", log)
  }),
)
