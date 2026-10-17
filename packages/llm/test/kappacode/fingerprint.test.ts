import { describe, expect } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { Headers, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { RequestExecutor } from "../../src/route"
import { it } from "../lib/effect"

// Kappa browser-fingerprint transport. A request tagged with the Kappa marker
// header is forwarded with Chrome-aligned headers (upstream sees a browser
// signature for Cloudflare-guarded providers like freeinference 403 1010) and
// the marker header itself is stripped before it reaches the wire.
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

  it.effect("strips the marker and applies Chrome headers on a fingerprint request", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<Record<string, string> | undefined>(undefined)
      const fpRequest = HttpClientRequest.post("https://provider.test/v1/chat").pipe(
        HttpClientRequest.setHeaders(
          Headers.fromInput({ authorization: "Bearer secret", "x-kappa-fingerprint": "chrome" }),
        ),
      )
      return yield* Effect.gen(function* () {
        const executor = yield* RequestExecutor.Service
        yield* executor.execute(fpRequest).pipe(Effect.flip, Effect.ignore)
        const headers = yield* Ref.get(seen)
        expect(headers?.["sec-ch-ua"]).toBe('"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"')
        expect(headers?.["sec-ch-ua-platform"]).toBe('"Linux"')
        expect(headers?.["accept-language"]).toBe("en-US,en;q=0.9")
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