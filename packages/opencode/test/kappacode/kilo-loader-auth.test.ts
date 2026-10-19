// kappacode_change - new file
// Tests that unauthenticated Kappa models are assembled with paid models and autoloaded anonymously.

import { expect } from "bun:test"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ModelsDev } from "../../src/provider/models.ts"
import * as CoreModels from "@opencode-ai/core/models-dev"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { kappaCustomLoaders, patchKappaProviderPrivacy } from "../../src/kappacode/provider/provider.ts"
import { Auth } from "../../src/auth/index.ts"
import type { Config } from "../../src/config/config.ts"
import { ModelCache } from "../../src/provider/model-cache.ts"
import { Provider } from "../../src/provider/provider.ts"
import { TestConfig } from "../fixture/config.ts"
import { testEffect } from "../lib/effect.ts"
import { provideInstance, testInstanceStoreLayer } from "../fixture/fixture.ts"

const input = {
  id: "kappa",
  name: "Kappa Gateway",
  env: ["KAPPA_API_KEY"],
  models: {
    "free-model": {
      id: "free-model",
      name: "Free Model",
      release_date: "",
      attachment: false,
      reasoning: false,
      temperature: true,
      tool_call: true,
      cost: { input: 0, output: 0 },
      limit: { context: 128000, output: 4096 },
    },
    "paid-model": {
      id: "paid-model",
      name: "Paid Model",
      release_date: "",
      attachment: false,
      reasoning: false,
      temperature: true,
      tool_call: true,
      cost: { input: 1, output: 2 },
      limit: { context: 128000, output: 4096 },
    },
  },
} satisfies ModelsDev.Provider

const seed: Record<string, ModelsDev.Provider> = {
  kappa: input,
  apertis: {
    id: "apertis",
    name: "Apertis",
    env: ["APERTIS_API_KEY"],
    models: {},
  },
}

const auth = Layer.mock(Auth.Service)({
  get: () => Effect.succeed(undefined),
})

const files = Layer.effect(
  FSUtil.Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return FSUtil.Service.of({
      ...fs,
      readJson: () => Effect.succeed(seed),
      stat: () => fs.stat(import.meta.path),
    })
  }),
).pipe(Layer.provide(FSUtil.defaultLayer))

function load(data?: { auth?: object; config?: object; env?: Record<string, string | undefined> }) {
  return kappaCustomLoaders({
    auth: () => Effect.succeed(data?.auth),
    config: () => Effect.succeed(data?.config ?? {}),
    env: () => Effect.succeed(data?.env ?? {}),
    get: () => Effect.succeed(undefined),
  }).kappa(input)
}

function layer(options?: { config?: Config.Info; info?: Auth.Info; fetch?: ModelCache.KappaModels["fetch"] }) {
  const cfg = TestConfig.layer({ get: () => Effect.succeed(options?.config ?? {}) })
  const access = options?.info ? Layer.mock(Auth.Service)({ get: () => Effect.succeed(options.info) }) : auth
  const models = Layer.succeed(
    ModelCache.KappaModelsService,
    ModelCache.KappaModelsService.of({
      fetch:
        options?.fetch ??
        (() =>
          Effect.succeed({
            models: {
              "free-model": {
                id: "free-model",
                name: "Free Model",
                cost: { input: 0, output: 0 },
                limit: { context: 128000, output: 4096 },
              },
              "paid-model": {
                id: "paid-model",
                name: "Paid Model",
                cost: { input: 1, output: 2 },
                isFree: false,
                mayTrainOnYourPrompts: true,
                limit: { context: 128000, output: 4096 },
              },
            },
          })),
    }),
  )
  const cache = Layer.fresh(ModelCache.layer).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(cfg),
    Layer.provide(access),
    Layer.provide(models),
  )
  const core = Layer.succeed(
    CoreModels.Service,
    CoreModels.Service.of({
      get: () => Effect.succeed(seed),
      refresh: () => Effect.void,
    }),
  )
  return Layer.fresh(ModelsDev.layer).pipe(
    Layer.provide(core),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(files),
    Layer.provide(cfg),
    Layer.provide(access),
    Layer.provide(cache),
  )
}

const it = testEffect(testInstanceStoreLayer)

function environment(values: Record<string, string | undefined>) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[key]
        if (value !== undefined) process.env[key] = value
      }
      return previous
    }),
    (previous) =>
      Effect.sync(() => {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key]
          if (value !== undefined) process.env[key] = value
        }
      }),
  )
}

it.live("assembles paid Kappa models without auth", () =>
  Effect.gen(function* () {
    const providers = yield* ModelsDev.Service.use((models) => models.get()).pipe(
      Effect.provide(layer()),
      provideInstance(process.cwd()),
    )
    const kappa = Provider.fromModelsDevProvider(providers.kappa)

    expect(kappa.models["paid-model"]).toMatchObject({
      id: "paid-model",
      providerID: "kappa",
      cost: { input: 1, output: 2 },
      isFree: false,
      mayTrainOnYourPrompts: true,
    })
  }),
)

it.live("does not infer free status from zero catalog prices", () =>
  Effect.gen(function* () {
    const providers = yield* ModelsDev.Service.use((models) => models.get()).pipe(
      Effect.provide(layer()),
      provideInstance(process.cwd()),
    )
    const kappa = Provider.fromModelsDevProvider(providers.kappa)

    expect(kappa.models["free-model"].isFree).toBeUndefined()
  }),
)

for (const context of ["config", "oauth", "env", "url"] as const) {
  for (const outcome of ["empty", "unauthorized", "network", "throw"] as const) {
    it.live(`keeps ${context} Org ${outcome} catalogs unavailable without public fallback or detached refresh`, () =>
      Effect.gen(function* () {
        yield* environment({ KAPPA_API_KEY: undefined, KAPPA_ORG_ID: context === "env" ? "org-env" : undefined })
        const calls: Parameters<ModelCache.KappaModels["fetch"]>[0][] = []
        const config: Config.Info =
          context === "config"
            ? { provider: { kappa: { options: { kappacodeOrganizationId: "org-config" } } } }
            : context === "url"
              ? { provider: { kappa: { options: { baseURL: "https://gateway.test/api/organizations/org-url" } } } }
              : {}
        const info =
          context === "env"
            ? undefined
            : new Auth.Oauth({
                type: "oauth",
                access: "test-token",
                refresh: "test-refresh",
                expires: 0,
                ...(context === "oauth" ? { accountId: "org-oauth" } : {}),
              })
        const fetch: ModelCache.KappaModels["fetch"] = (options) =>
          Effect.gen(function* () {
            calls.push(options)
            if (outcome === "throw") return yield* Effect.fail(new Error("offline"))
            return { models: {}, ...(outcome === "empty" ? {} : { error: { kind: outcome } }) }
          })
        yield* ModelsDev.Service.use((models) =>
          Effect.gen(function* () {
            expect((yield* models.get()).kappa.models).toEqual({})
            expect((yield* models.get()).kappa.models).toEqual({})
            expect(calls).toHaveLength(outcome === "throw" ? 2 : 1)
            expect(calls.at(0)?.kappacodeOrganizationId).toBe(`org-${context}`)
          }),
        ).pipe(Effect.provide(layer({ config, info, fetch })), provideInstance(process.cwd()))
      }),
    )
  }
}

for (const scenario of [
  {
    name: "environment",
    env: "org-env",
    account: "org-oauth",
    configured: "org-config",
    baseURL: "https://gateway.test",
    org: "org-env",
    url: "https://gateway.test/api/organizations/org-env",
  },
  {
    name: "OAuth",
    env: undefined,
    account: "org-oauth",
    configured: "org-config",
    baseURL: "https://gateway.test",
    org: "org-oauth",
    url: "https://gateway.test/api/organizations/org-oauth",
  },
  {
    name: "configured",
    env: undefined,
    account: undefined,
    configured: "org-config",
    baseURL: "https://gateway.test",
    org: "org-config",
    url: "https://gateway.test/api/organizations/org-config",
  },
  {
    name: "scoped URL",
    env: undefined,
    account: undefined,
    configured: undefined,
    baseURL: "https://gateway.test/api/organizations/org-url",
    org: "org-url",
    url: "https://gateway.test/api/organizations/org-url",
  },
]) {
  it.live(`wrapper and cache use the same ${scenario.name} organization and credentials`, () =>
    Effect.gen(function* () {
      yield* environment({ KAPPA_ORG_ID: scenario.env, KAPPA_API_KEY: "env-token" })
      const calls: Parameters<ModelCache.KappaModels["fetch"]>[0][] = []
      const config: Config.Info = {
        provider: {
          kappa: {
            options: {
              apiKey: "configured-token",
              kappacodeOrganizationId: scenario.configured,
              baseURL: scenario.baseURL,
            },
          },
        },
      }
      const info = new Auth.Oauth({
        type: "oauth",
        access: "stored-token",
        refresh: "refresh",
        expires: 0,
        accountId: scenario.account,
      })
      const providers = yield* ModelsDev.Service.use((models) => models.get()).pipe(
        Effect.provide(
          layer({
            config,
            info,
            fetch: (options) => {
              calls.push(options)
              return Effect.succeed({
                models: { allowed: { id: "allowed", name: "Allowed", limit: { context: 128000, output: 4096 } } },
              })
            },
          }),
        ),
        provideInstance(process.cwd()),
      )
      expect(Object.keys(providers.kappa.models)).toEqual(["allowed"])
      expect(calls).toHaveLength(1)
      expect(calls.at(0)).toMatchObject({
        kappacodeOrganizationId: scenario.org,
        kappacodeToken: "env-token",
        baseURL: scenario.url,
      })
    }),
  )
}

it.live("does not serve a warm or public catalog after an Org-scoped URL conflicts with the selected Org", () =>
  Effect.gen(function* () {
    yield* environment({ KAPPA_ORG_ID: "org-env", KAPPA_API_KEY: "env-token" })
    const options = { baseURL: "https://gateway.test/api/organizations/org-env" }
    const calls: Parameters<ModelCache.KappaModels["fetch"]>[0][] = []
    yield* ModelsDev.Service.use((models) =>
      Effect.gen(function* () {
        expect(Object.keys((yield* models.get()).kappa.models)).toEqual(["allowed"])
        options.baseURL = "https://gateway.test/api/organizations/org-other"
        expect((yield* models.get()).kappa.models).toEqual({})
        expect((yield* models.get()).kappa.models).toEqual({})
        options.baseURL = "https://gateway.test/api/organizations/org-env"
        expect(Object.keys((yield* models.get()).kappa.models)).toEqual(["allowed"])
        expect(calls).toHaveLength(1)
      }),
    ).pipe(
      Effect.provide(
        layer({
          config: { provider: { kappa: { options } } },
          fetch: (input) => {
            calls.push(input)
            return Effect.succeed({
              models: { allowed: { id: "allowed", name: "Allowed", limit: { context: 128000, output: 4096 } } },
            })
          },
        }),
      ),
      provideInstance(process.cwd()),
    )
  }),
)

it.live("preserves Personal public snapshot fallback", () =>
  Effect.gen(function* () {
    const env = process.env.KAPPA_ORG_ID
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        delete process.env.KAPPA_ORG_ID
      }),
      () =>
        Effect.sync(() => {
          if (env !== undefined) process.env.KAPPA_ORG_ID = env
        }),
    )
    const providers = yield* ModelsDev.Service.use((models) => models.get()).pipe(
      Effect.provide(layer({ fetch: () => Effect.succeed({ models: {} }) })),
      provideInstance(process.cwd()),
    )
    expect(providers.kappa.models).toEqual(input.models)
  }),
)

it.effect("enables a paid catalog anonymously without auth", () =>
  Effect.gen(function* () {
    const result = yield* load()
    expect(result.autoload).toBe(true)
    expect(result.options).toEqual({ apiKey: "anonymous" })
  }),
)

it.effect("enables a paid catalog when config apiKey is present", () =>
  Effect.gen(function* () {
    const result = yield* load({ config: { provider: { kappa: { options: { apiKey: "test-key" } } } } })
    expect(result.autoload).toBe(true)
    expect(result.options).toEqual({})
  }),
)

it.effect("denies provider data collection when prompt-training models are hidden", () =>
  Effect.gen(function* () {
    const result = yield* load({ config: { hide_prompt_training_models: true } })
    expect(result.options).toEqual({ apiKey: "anonymous", dataCollection: "deny" })
  }),
)

it.effect("keeps data collection denied after configured options are applied", () =>
  Effect.sync(() => {
    const provider = { options: { dataCollection: "allow", baseURL: "https://api.kappa.ai" } }
    patchKappaProviderPrivacy(provider, { hide_prompt_training_models: true })
    expect(provider.options).toEqual({ dataCollection: "deny", baseURL: "https://api.kappa.ai" })
  }),
)

it.effect("enables a paid catalog when auth exists", () =>
  Effect.gen(function* () {
    const result = yield* load({ auth: { type: "api", key: "test-key" } })
    expect(result.autoload).toBe(true)
    expect(result.options).toEqual({})
  }),
)
