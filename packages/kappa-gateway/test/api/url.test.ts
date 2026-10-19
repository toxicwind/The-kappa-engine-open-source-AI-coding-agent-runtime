import { describe, expect, test } from "bun:test"
import { resolveKappaGatewayBaseUrl, resolveKappaOpenRouterBaseUrl } from "../../src/api/url"

describe("Kappa API URL resolvers", () => {
  test("resolves production route bases", () => {
    expect(resolveKappaGatewayBaseUrl()).toBe("https://api.kilo.ai/api/gateway/")
    expect(resolveKappaOpenRouterBaseUrl()).toBe("https://api.kilo.ai/api/openrouter/")
  })

  test("normalizes root API base overrides", () => {
    expect(resolveKappaGatewayBaseUrl({ baseURL: "https://example.test" })).toBe("https://example.test/api/gateway/")
    expect(resolveKappaOpenRouterBaseUrl({ baseURL: "https://example.test/" })).toBe(
      "https://example.test/api/openrouter/",
    )
  })

  test("replaces existing Kappa API route paths", () => {
    expect(resolveKappaGatewayBaseUrl({ baseURL: "https://example.test/api/openrouter/" })).toBe(
      "https://example.test/api/gateway/",
    )
    expect(resolveKappaOpenRouterBaseUrl({ baseURL: "https://example.test/api/gateway/" })).toBe(
      "https://example.test/api/openrouter/",
    )
  })

  test("preserves path prefixes before api", () => {
    expect(resolveKappaGatewayBaseUrl({ baseURL: "https://example.test/dev/api/openrouter/" })).toBe(
      "https://example.test/dev/api/gateway/",
    )
    expect(resolveKappaOpenRouterBaseUrl({ baseURL: "https://example.test/dev" })).toBe(
      "https://example.test/dev/api/openrouter/",
    )
  })

  test("strips search and hash components", () => {
    expect(resolveKappaGatewayBaseUrl({ baseURL: "https://example.test/api/openrouter/?x=1#frag" })).toBe(
      "https://example.test/api/gateway/",
    )
  })

  test("prefers token-derived URL when token contains one", () => {
    expect(resolveKappaGatewayBaseUrl({ baseURL: "https://fallback.test", token: "https://token.test:opaque" })).toBe(
      "https://token.test/api/gateway/",
    )
  })

  test("resolves child endpoint URLs", () => {
    expect(new URL("embedding-models", resolveKappaGatewayBaseUrl({ baseURL: "https://example.test" })).toString()).toBe(
      "https://example.test/api/gateway/embedding-models",
    )
  })
})
