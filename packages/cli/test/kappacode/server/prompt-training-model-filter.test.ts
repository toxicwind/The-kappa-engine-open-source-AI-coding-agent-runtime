import { afterEach, expect, spyOn } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Auth } from "../../../src/auth/index.ts"
import { ModelCache } from "../../../src/provider/model-cache.ts"
import { Server } from "../../../src/server/server.ts"
import * as Log from "@opencode-ai/core/util/log"
import { disposeAllInstances, tmpdir } from "../../fixture/fixture.ts"
import { resetDatabase } from "../../fixture/db.ts"
import { testEffectShared } from "../../lib/effect.ts"

const it = testEffectShared(Layer.merge(AppNodeBuilder.build(ModelCache.node), AppNodeBuilder.build(Auth.node)))

void Log.init({ print: false })

const response = {
  data: [
    {
      id: "test/training",
      name: "Training",
      context_length: 128000,
      max_completion_tokens: 4096,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: ["tools", "temperature"],
      mayTrainOnYourPrompts: true,
    },
    {
      id: "test/private",
      name: "Private",
      context_length: 128000,
      max_completion_tokens: 4096,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      supported_parameters: ["tools", "temperature"],
      mayTrainOnYourPrompts: false,
    },
  ],
}

for (const scenario of [
  "valid",
  "missing",
  "empty-default",
  "disallowed",
  "default-error",
  "empty",
  "error",
  "unauthorized",
  "filtered",
] as const) {
  it.live(`keeps Org catalogs and recommendations safe: ${scenario}`, () =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const previous = Flag.KAPPA_DISABLE_MODELS_FETCH
          Flag.KAPPA_DISABLE_MODELS_FETCH = true
          return previous
        }),
        (previous) =>
          Effect.sync(() => {
            Flag.KAPPA_DISABLE_MODELS_FETCH = previous
          }),
      )
      const cache = yield* ModelCache.Service
      yield* cache.clear("kappa")
      const env = {
        KAPPA_AUTH_CONTENT: process.env.KAPPA_AUTH_CONTENT,
        KAPPA_API_KEY: process.env.KAPPA_API_KEY,
        KAPPA_ORG_ID: process.env.KAPPA_ORG_ID,
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          process.env.KAPPA_AUTH_CONTENT = JSON.stringify({
            kappa: {
              type: "oauth",
              access: "test-token",
              refresh: "test-refresh",
              expires: 0,
              accountId: "org-oauth",
            },
          })
          delete process.env.KAPPA_API_KEY
          process.env.KAPPA_ORG_ID = "org-env"
        }),
        () =>
          Effect.sync(() => {
            for (const [key, value] of Object.entries(env)) {
              if (value === undefined) delete process.env[key]
              else process.env[key] = value
            }
          }),
      )
      const paths: string[] = []
      const original = globalThis.fetch
      let active = true
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          globalThis.fetch = Object.assign(
            async (input: RequestInfo | URL, init?: RequestInit) => {
              if (!active) return original(input, init)
              const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
              if (url.pathname.endsWith("/modes")) return new Response(null, { status: 404 })
              if (!url.pathname.endsWith("/models") && !url.pathname.endsWith("/defaults")) return original(input, init)
              paths.push(url.pathname)
              if (url.pathname.endsWith("/defaults")) {
                if (scenario === "default-error") return new Response(null, { status: 500 })
                return Response.json({
                  defaultModel:
                    scenario === "valid"
                      ? "test/z-last"
                      : scenario === "disallowed"
                        ? "test/training"
                        : scenario === "empty-default"
                          ? ""
                          : undefined,
                })
              }
              if (url.pathname === "/api/organizations/org-env/models") {
                if (scenario === "unauthorized") return new Response(null, { status: 401 })
                if (scenario === "error") return new Response(null, { status: 500 })
                if (scenario === "empty") return Response.json({ data: [] })
                return Response.json({
                  data: [
                    ...response.data,
                    { ...response.data.at(1), id: "test/z-last", name: "Last", preferredIndex: 0 },
                  ],
                })
              }
              return Response.json({ data: [{ ...response.data.at(1), id: "public/leak" }] })
            },
            { preconnect: original.preconnect },
          )
        }),
        () =>
          Effect.sync(() => {
            active = false
            globalThis.fetch = original
          }),
      )
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() =>
          tmpdir({
            config: {
              formatter: false,
              lsp: false,
              enabled_providers: ["kappa", "external"],
              hide_prompt_training_models: true,
              provider: {
                kappa: {
                  options: { kappacodeOrganizationId: "org-config" },
                  ...(scenario === "filtered" ? { whitelist: ["test/training"] } : {}),
                },
                external: {
                  npm: "@ai-sdk/openai-compatible",
                  options: { apiKey: "external-test-key" },
                  models: { independent: { name: "Independent", limit: { context: 128000, output: 4096 } } },
                },
              },
            },
          }),
        ),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const all = yield* request("/provider", tmp.path)
      const connected = yield* request("/config/providers", tmp.path)
      expect(yield* request("/kappa/auth-status", tmp.path)).toEqual({
        authenticated: true,
        type: "oauth",
        organizationId: "org-env",
      })
      const unavailable = ["empty", "error", "unauthorized", "filtered"].includes(scenario)
      expect(models(all, "all")).toEqual(unavailable ? [] : ["test/private", "test/z-last"])
      expect(models(connected, "providers")).toEqual(unavailable ? [] : ["test/private", "test/z-last"])
      expect(connected.default.kappa).toBe(
        unavailable ? undefined : scenario === "valid" ? "test/z-last" : "test/private",
      )
      expect(all.default.kappa).toBe(connected.default.kappa)
      expect(connected.default.external).toBe("independent")
      expect(all.default.external).toBe("independent")
      expect(all.connected).toContain("external")
      expect(paths.filter((path) => path.endsWith("/models"))).toEqual(["/api/organizations/org-env/models"])
      expect(paths.filter((path) => path.endsWith("/defaults"))).toEqual(
        unavailable ? [] : ["/api/organizations/org-env/defaults", "/api/organizations/org-env/defaults"],
      )
      if (scenario === "valid") {
        const auth = yield* Auth.Service
        yield* Effect.acquireUseRelease(
          Effect.sync(() =>
            spyOn(auth, "get").mockImplementation(() =>
              Effect.fail(new Auth.AuthError({ message: "Cannot read credentials after provider initialization" })),
            ),
          ),
          () =>
            Effect.gen(function* () {
              const retained = yield* request("/provider", tmp.path)
              const configured = yield* request("/config/providers", tmp.path)
              expect(models(retained, "all")).toEqual(["test/private", "test/z-last"])
              expect(models(configured, "providers")).toEqual(["test/private", "test/z-last"])
              expect(retained.connected).toEqual(all.connected)
              expect(retained.failed).toEqual(["kappa"])
              expect(retained.default).toEqual({ external: "independent", kappa: "test/private" })
              expect(configured.default).toEqual(retained.default)
              expect(paths.filter((path) => path.endsWith("/defaults"))).toHaveLength(2)
              expect(paths.filter((path) => path.endsWith("/models"))).toHaveLength(1)
            }),
          (spy) => Effect.sync(() => spy.mockRestore()),
        )
        const recovered = yield* request("/provider", tmp.path)
        const configured = yield* request("/config/providers", tmp.path)
        expect(recovered.default.kappa).toBe("test/z-last")
        expect(configured.default.kappa).toBe(recovered.default.kappa)
        expect(recovered.failed).toEqual([])
        expect(paths.filter((path) => path.endsWith("/defaults"))).toHaveLength(4)
      }
    }),
  )
}

function record(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

function models(input: unknown, key: "all" | "providers") {
  if (!record(input) || !Array.isArray(input[key])) return []
  const kappa = input[key].find((provider) => record(provider) && provider.id === "kappa")
  if (!record(kappa) || !record(kappa.models)) return []
  return Object.keys(kappa.models)
}

function request(path: string, dir: string) {
  return Effect.promise(async () => {
    const result = await Server.Default().app.request(path, { headers: { "x-kappa-directory": dir } })
    expect(result.status).toBe(200)
    return result.json()
  })
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

it.live(
  "filters prompt-training models from both provider catalogs",
  Effect.gen(function* () {
    const cache = yield* ModelCache.Service
    yield* cache.clear("kappa")
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          port: 0,
          fetch() {
            return Response.json(response)
          },
        }),
      ),
      (server) => Effect.sync(() => server.stop(true)),
    )
    const baseURL = `http://127.0.0.1:${server.port}`
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() =>
        tmpdir({
          config: {
            formatter: false,
            lsp: false,
            enabled_providers: ["kappa"],
            hide_prompt_training_models: true,
            provider: { kappa: { options: { baseURL } } },
          },
        }),
      ),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const key = process.env.KAPPA_API_KEY
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        process.env.KAPPA_API_KEY = "test-key"
      }),
      () =>
        Effect.sync(() => {
          if (key === undefined) delete process.env.KAPPA_API_KEY
          else process.env.KAPPA_API_KEY = key
        }),
    )

    const all = yield* request("/provider", tmp.path)
    const connected = yield* request("/config/providers", tmp.path)

    expect(models(all, "all")).toEqual(["test/private"])
    expect(models(connected, "providers")).toEqual(["test/private"])
  }),
)
