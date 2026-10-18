import { Effect, Layer } from "effect"
import { Auth } from "../../src/auth/index.ts"

export const empty = Layer.mock(Auth.Service)({
  all: () => Effect.succeed({}),
})

export * as AuthTest from "./auth.ts"
