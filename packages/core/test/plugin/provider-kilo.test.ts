import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AISDK } from "@opencode-ai/core/aisdk" // kappacode_change
import { Catalog } from "@opencode-ai/core/catalog"
import { ModelV2 } from "@opencode-ai/core/model" // kappacode_change
import { PluginV2 } from "@opencode-ai/core/plugin"
import { PluginHost } from "@opencode-ai/core/plugin/host"
import { ProviderPlugins } from "@opencode-ai/core/plugin/provider"
import { KappaPlugin } from "@opencode-ai/core/plugin/provider/kappa"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const addPlugin = Effect.fn(function* () {
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugin)
  yield* KappaPlugin.effect(host)
})

// kappacode_change start
function withEnv<A, E, R>(vars: Record<string, string | undefined>, effect: () => Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]))
      for (const [key, value] of Object.entries(vars)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      return previous
    }),
    effect,
    (previous) =>
      Effect.sync(() => {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }),
  )
}
// kappacode_change end

describe("KappaPlugin", () => {
  it.effect("is registered so legacy referer headers can be applied", () =>
    Effect.sync(() => expect(ProviderPlugins.map((item) => item.id)).toContain(PluginV2.ID.make("kappa"))),
  )

  it.effect("applies legacy referer headers only to kappa", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.make("kappa"), (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.kappa.ai/api/gateway",
          }
          provider.request = { headers: { Existing: "value" }, body: {} }
        })
        catalog.provider.update(ProviderV2.ID.openrouter, () => {})
      })
      yield* addPlugin()
      expect((yield* catalog.provider.get(ProviderV2.ID.make("kappa")))?.request.headers).toEqual({
        Existing: "value",
        "HTTP-Referer": "https://kappa.ai/",
        "X-Title": "Kappa Code", // kappacode_change
      })
      expect((yield* catalog.provider.get(ProviderV2.ID.openrouter))?.request.headers).toEqual({})
    }),
  )

  it.effect("uses the exact legacy Kappa header casing and set", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.make("kappa"), (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.kappa.ai/api/gateway",
          }
        })
      })
      yield* addPlugin()

      expect((yield* catalog.provider.get(ProviderV2.ID.kappa))?.request.headers).toEqual({
        "HTTP-Referer": "https://kappa.ai/",
        "X-Title": "Kappa Code", // kappacode_change
      })
      expect((yield* catalog.provider.get(ProviderV2.ID.make("kappa")))?.request.headers).not.toHaveProperty(
        "http-referer",
      )
      expect((yield* catalog.provider.get(ProviderV2.ID.make("kappa")))?.request.headers).not.toHaveProperty("x-title")
      expect((yield* catalog.provider.get(ProviderV2.ID.make("kappa")))?.request.headers).not.toHaveProperty("X-Source")
    }),
  )

  it.effect("uses the legacy provider-id guard instead of endpoint package matching", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.make("kappa"), (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.kappa.ai/api/gateway",
          }
        })
        catalog.provider.update(ProviderV2.ID.make("custom-kappa"), (provider) => {
          provider.api = { type: "aisdk", package: "kappa" }
        })
      })
      yield* addPlugin()

      expect((yield* catalog.provider.get(ProviderV2.ID.kappa))?.request.headers).toEqual({
        "HTTP-Referer": "https://kappa.ai/",
        "X-Title": "Kappa Code", // kappacode_change
      })
      expect((yield* catalog.provider.get(ProviderV2.ID.make("custom-kappa")))?.request.headers).toEqual({})
    }),
  )

  // kappacode_change start
  it.effect("routes the Kappa catalog through the Kappa Gateway SDK", () =>
    withEnv({ KAPPA_API_KEY: undefined, KAPPA_ORG_ID: undefined }, () =>
      Effect.gen(function* () {
        const aisdk = yield* AISDK.Service
        const catalog = yield* Catalog.Service
        yield* catalog.transform((catalog) => {
          catalog.provider.update(ProviderV2.ID.kappa, (provider) => {
            provider.api = {
              type: "aisdk",
              package: "@ai-sdk/openai-compatible",
              url: "https://api.kappa.ai/api/gateway",
            }
            provider.request = { headers: {}, body: { apiKey: "stored-token" } }
          })
        })
        yield* addPlugin()
        const updated = yield* catalog.provider.get(ProviderV2.ID.kappa)

        expect(updated?.api).toEqual({
          type: "aisdk",
          package: "@kappacode/kappa-gateway",
          url: "https://api.kappa.ai/api/openrouter",
        })
        expect(updated?.request.body.kappacodeToken).toBe("stored-token")

        const result = yield* aisdk.runSDK({
          model: ModelV2.Info.make({
            ...ModelV2.Info.empty(ProviderV2.ID.kappa, ModelV2.ID.make("kappa-auto/free")),
            api: {
              id: ModelV2.ID.make("kappa-auto/free"),
              type: "aisdk",
              package: "@kappacode/kappa-gateway",
            },
          }),
          package: "@kappacode/kappa-gateway",
          options: updated?.request.body ?? {},
        })
        expect(result.sdk).toBeDefined()
        expect(typeof result.sdk.languageModel).toBe("function")
        expect(typeof result.sdk.anthropic).toBe("function")
      }),
    ),
  )

  it.effect("keeps authenticated credentials ahead of inherited environment keys", () =>
    withEnv({ KAPPA_API_KEY: "environment-token", KAPPA_ORG_ID: "environment-org" }, () =>
      Effect.gen(function* () {
        const catalog = yield* Catalog.Service
        yield* catalog.transform((catalog) => {
          catalog.provider.update(ProviderV2.ID.kappa, (provider) => {
            provider.request = {
              headers: {},
              body: { apiKey: "authenticated-token", kappacodeOrganizationId: "authenticated-org" },
            }
          })
        })
        yield* addPlugin()
        const result = yield* catalog.provider.get(ProviderV2.ID.kappa)

        expect(result?.request.body.apiKey).toBe("authenticated-token")
        expect(result?.request.body.kappacodeToken).toBe("authenticated-token")
        expect(result?.request.body.kappacodeOrganizationId).toBe("environment-org")
      }),
    ),
  )

  it.effect("keeps anonymous Kappa models available without credentials", () =>
    withEnv({ KAPPA_API_KEY: undefined, KAPPA_ORG_ID: undefined }, () =>
      Effect.gen(function* () {
        const catalog = yield* Catalog.Service
        yield* catalog.transform((catalog) => catalog.provider.update(ProviderV2.ID.kappa, () => {}))
        yield* addPlugin()
        const result = yield* catalog.provider.get(ProviderV2.ID.kappa)

        expect((yield* catalog.provider.available()).map((provider) => provider.id)).toContain(ProviderV2.ID.kappa)
        expect(result?.request.body.apiKey).toBe("anonymous")
        expect(result?.request.body.kappacodeToken).toBe("anonymous")
      }),
    ),
  )
  // kappacode_change end
})
