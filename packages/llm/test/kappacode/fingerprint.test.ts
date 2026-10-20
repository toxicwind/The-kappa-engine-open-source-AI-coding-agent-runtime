import { describe, expect } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { Headers, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { RequestExecutor } from "../../src/route"
import { InstallationChannel, InstallationVersion } from "../../../core/src/installation/version"
import { Flag as KAPPA_FLAG } from "../../../core/src/flag/flag"
import { it } from "../lib/effect"

// Kappa fingerprint transport (honest identification policy, 2026-10-19).
// A tagged request's overlay depends on the marker value: default = honest
// `kappa/<version> (+repo)` UA (freeinference ToS bans fake user agents;
// probes show honest UA passes), explicit "chrome" = legacy Chrome-aligned
// set for providers that re-enable header gating. Marker is always stripped.
describe("Kappa fingerprint transport", () => {
  const captureLayer = (seen: Ref.Ref<Record<string, string> | undefined>) =>
    RequestExecutor.layer.pipe(
      Layer.provide(
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.gen(function* () {
              yield* Ref.set(seen, { ...request.headers })
              return HttpClientResponse.fromWeb(request, new Response("ok", { status: 200 }))
            }),
          ),
        ),
      ),
    )

  it.effect("strips the marker and applies honest kappa UA by default", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<Record<string, string> | undefined>(undefined)
      const fpRequest = HttpClientRequest.post("https://provider.test/v1/chat").pipe(
        HttpClientRequest.setHeaders(
          Headers.fromInput({ authorization: "Bearer secret", "x-kappa-fingerprint": "honest" }),
        ),
      )
      return yield* Effect.gen(function* () {
        const executor = yield* RequestExecutor.Service
        yield* executor.execute(fpRequest).pipe(Effect.flip, Effect.ignore)
        const headers = yield* Ref.get(seen)
        expect(headers?.["user-agent"]).toBe(
          `kappa/${InstallationChannel}/${InstallationVersion}/${KAPPA_FLAG.KAPPA_CLIENT} (+https://github.com/toxicwind/kappa-code)`,
        )
        expect(headers?.["sec-ch-ua"]).toBeUndefined()
        expect(headers?.["x-kappa-fingerprint"]).toBeUndefined()
        expect(headers?.["authorization"]).toBe("Bearer secret")
      }).pipe(Effect.provide(captureLayer(seen)))
    }))

  it.effect("leaves ordinary requests untouched", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<Record<string, string> | undefined>(undefined)
      const plain = HttpClientRequest.post("https://provider.test/v1/chat").pipe(
        HttpClientRequest.setHeaders(Headers.fromInput({ authorization: "Bearer secret" })),
      )
      return yield* Effect.gen(function* () {
        const executor = yield* RequestExecutor.Service
        yield* executor.execute(plain).pipe(Effect.flip, Effect.ignore)
        const headers = yield* Ref.get(seen)
        expect(headers?.["sec-ch-ua"]).toBeUndefined()
        expect(headers?.["x-kappa-fingerprint"]).toBeUndefined()
        expect(headers?.["authorization"]).toBe("Bearer secret")
      }).pipe(Effect.provide(captureLayer(seen)))
    }))
})