// kappacode_change - new file
// When the injected Kappa models source returns a 401 error result, ModelCache surfaces
// the failure and caches empty models (allowing re-auth via /connect).
// The real fetchKappaModels 401-fallback unit test lives in packages/kappa-gateway/test/api/models.test.ts.

import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import * as Log from "@opencode-ai/core/util/log"

Log.init({ print: false })

import { Auth } from "../../src/auth/index.ts"
import { ModelCache } from "../../src/provider/model-cache.ts"
import { TestConfig } from "../fixture/config.ts"
import { testEffect } from "../lib/effect.ts"

const auth = Layer.mock(Auth.Service)({
  get: () => Effect.succeed(undefined),
})

const models = Layer.succeed(
  ModelCache.KappaModelsService,
  ModelCache.KappaModelsService.of({
    fetch: () => Effect.succeed({ models: {}, error: { kind: "unauthorized", status: 401 } }),
  }),
)

const layer = Layer.fresh(ModelCache.layer).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(TestConfig.layer()),
  Layer.provide(auth),
  Layer.provide(models),
)

const it = testEffect(layer)

it.live("401 from Kappa models sets provider as failed in ModelCache", () =>
  Effect.gen(function* () {
    const cache = yield* ModelCache.Service
    yield* cache.fetch("kappa")
    expect(yield* cache.failedProviders()).toContain("kappa")
    expect(yield* cache.getFailure("kappa")).toMatchObject({ kind: "unauthorized", status: 401 })
  }),
)

it.live("401 from Kappa models caches empty models (not undefined)", () =>
  Effect.gen(function* () {
    const cache = yield* ModelCache.Service
    yield* cache.fetch("kappa")
    expect(yield* cache.get("kappa")).toEqual({})
  }),
)
