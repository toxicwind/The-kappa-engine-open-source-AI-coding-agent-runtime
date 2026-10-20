import { describe, expect } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { Headers, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { RequestExecutor } from "../../src/route"
import { InstallationChannel, InstallationVersion } from "../../../core/src/installation/version"
import { Flag as KAPPA_FLAG } from "../../../core/src/flag/flag"
import { it } from "../lib/effect"

// Kappa fingerprint transport — honest identification policy (2026-10-19).
//
// A request tagged with the Kappa marker header gets a persona overlay from the
// executor; the marker itself is stripped before the wire.
//
//   - default (any value except "chrome"): HONEST identification —
//     `kappa/<version> (+https://github.com/toxicwind/kappa-code)`. Providers
//     like freeinference ban fake user agents; live probes
//     (estate/docs/freeinference-provider.md, 2026-10-19) show honest UA passes.
//   - explicit "chrome": the legacy Chrome-aligned header set, kept ONLY for
//     providers that re-enable Cloudflare-style header gating.
//   - untagged requests pass through completely untouched.
describe("Kappa fingerprint transport (honest identification)", () => {
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

  it.effect("default fingerprint applies honest kappa UA with repo backlink", () =>
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
        expect(headers?.["x-kappa-fingerprint"]).toBeUndefined()
        expect(headers?.["sec-ch-ua"]).toBeUndefined()
        expect(headers?.["authorization"]).toBe("Bearer secret")
      }).pipe(Effect.provide(captureLayer(seen)))
    }))

  it.effect("explicit chrome persona keeps the legacy Chrome-aligned header set", () =>
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
        expect(headers?.["x-kappa-fingerprint"]).toBeUndefined()
        expect(headers?.["authorization"]).toBe("Bearer secret")
      }).pipe(Effect.provide(captureLayer(seen)))
    }))

  it.effect("untagged requests are untouched (no UA injection at this layer)", () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<Record<string, string> | undefined>(undefined)
      const plain = HttpClientRequest.post("https://provider.test/v1/chat").pipe(
        HttpClientRequest.setHeaders(Headers.fromInput({ authorization: "Bearer secret" })),
      )
      return yield* Effect.gen(function* () {
        const executor = yield* RequestExecutor.Service
        yield* executor.execute(plain).pipe(Effect.flip, Effect.ignore)
        const headers = yield* Ref.get(seen)
        expect(headers?.["x-kappa-fingerprint"]).toBeUndefined()
        expect(headers?.["sec-ch-ua"]).toBeUndefined()
        expect(headers?.["authorization"]).toBe("Bearer secret")
      }).pipe(Effect.provide(captureLayer(seen)))
    }))
})
